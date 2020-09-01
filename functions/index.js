const functions = require('firebase-functions');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const firebaseAdmin = require('firebase-admin');
const { PubSub } = require('@google-cloud/pubsub');
const { WebhookClient } = require('dialogflow-fulfillment');

firebaseAdmin.initializeApp();
const db = firebaseAdmin.database();

const championsUrl = `https://www.leagueofgraphs.com/`;
const championById = (id) => `${championsUrl}/pt/champions/counters/${id}`;
const championMainContentById = (id) => `${championsUrl}/pt/champions/builds/${id}`;



async function fetchLolChampion(id) {
  const data = await fetch(championById(id))
  if (!data.ok) {
    throw new Error('Champion not found')
  }

  const dataMain = await fetch(championMainContentById(id));
  if (!dataMain.ok) {
    response.status(404).json({ message: 'Champion not found' })
    return;
  }

  const html = await data.text();
  const htmlMain = await dataMain.text();
  const $ = cheerio.load(html);
  const $main = cheerio.load(htmlMain)

  let winRate = $main('#graphDD2').text();
  const imageUrl = $main('.pageBanner div img').attr('src');

  if (winRate) {
    winRate = parseFloat(winRate.trim());
  }

  const champion = {
    id,
    lastUpdate: Date.now(),
    imageUrl,
    winRate,
    winner: {},
    losses: {},
    wellWith: {}
  }


  $('.box').each((index, el) => {

    $(el).find('tr').each((_, matchChampion) => {
      var matchChampionElement = $(matchChampion).find('td a');

      const id = matchChampionElement.attr('href');
      const name = $(matchChampionElement).find('.name').text();
      const winRateMatch = $(matchChampion).find('td > progressbar').attr('data-value');

      if (name) {
        const createChampion = {
          id: id.split('/').pop().split('-').pop(),
          name,
          winRate: parseFloat((((winRateMatch * 100)) + winRate).toFixed(2)),
        }

        if (index === 0) {
          champion.winner[createChampion.id] = createChampion
        }

        if (index === 1) {
          champion.wellWith[createChampion.id] = createChampion
        }

        if (index === 2) {
          champion.losses[createChampion.id] = createChampion
        }
      }
    })

  });

  return champion;
}

const fetchLolChampionTopic = 'fetch-lol-champion-topic';
exports.fetchLolChampion = functions.pubsub.topic(fetchLolChampionTopic)
  .onPublish(async (msg) => {
    try {
      const { id } = msg.json
      const champion = await fetchLolChampion(id);
      const championsRef = db.ref('/champions').child(id);
      await championsRef.update(champion);
    } catch (err) {
      console.error(err)
    }
  })


exports.fetchLolChampions = functions.pubsub.schedule('0 6 * * *').onRun(async (context) => {
  //exports.fetchLolChampions = functions.https.onRequest(async (_, response) => {
  const data = await fetch(championsUrl)
  const html = await data.text();
  const $ = cheerio.load(html);

  const champions = $('.championBox').map((_, el) => {
    const id = $(el).find('a').attr('href');
    const name = $(el).find('.championName').text().trim();

    return {
      id: id.split('/').pop(),
      name
    }
  }).toArray();

  const championsMap = {}
  champions.forEach(champion => {
    Object.keys(champion).forEach(attr => {
      championsMap[`${champion.id}/${attr}`] = champion[attr]
    })
  })


  const pubSub = new PubSub({
    projectId: process.env.GCLOUD_PROJECT
  })

  const publishPromises = champions.map(champion => {
    return pubSub.topic(fetchLolChampionTopic).publishJSON({ id: champion.id });
  })

  const championsRef = db.ref('/champions');
  await championsRef.update(championsMap);
  await Promise.all(publishPromises);
});


function joinOr(names, joiner = 'ou') {
  if (names.length === 0) {
    return 0
  }

  if (names.length === 1) {
    return names[0]
  }

  if (names.length === 2) {
    return names.join(` ${joiner} `)
  }

  if (names.length > 2) {
    const firstNames = names.slice(0, -1)
    const lastName = names[names.length - 1]
    return firstNames.join(', ') + ` ${joiner} ` + lastName
  }
}

function pickOne(list) {
  const max = list.length
  const pick = Math.floor(Math.random() * max)
  return list[pick]
}

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }

  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }
  /**
 * Best Champion Intent
 * @param {WebhookClient} agent
 */
  async function bestChampionHandler(agent) {
    const { champion } = agent.parameters

    async function loadChampion(id) {
      const championsRef = db.ref('/champions');
      const championSnap = await championsRef.child(id).once('value');
      return await championSnap.val();
    }

    const championData = await loadChampion(champion);

    if (!champion) {
      agent.add('Desculpe, não encontrei esse campeão');
      return;
    }

    const losses = Object.values(championData.losses)
      .sort((a, b) => { return a.winRate - b.winRate })
      .slice(0, 3)
      .map(x => x.name);

    agent.add(pickOne([
      `Humm, você poderia escolher ${joinOr(losses)}`,
      `Escolher entre  ${joinOr(losses)} vão aumentar suas chances de vitória`,
      `Boas escolhas seriam ${joinOr(losses)}`,
      `Olhando as últimas partidas  ${joinOr(losses)} seriam boas escolhas`,
      `Se escolher ${joinOr(losses)} você vai ter boas chances`,
      `Escolha  ${joinOr(losses)} e tenha um bom jogo!`
    ]))
  }

  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('BestChampion', bestChampionHandler)

  agent.handleRequest(intentMap);
});
