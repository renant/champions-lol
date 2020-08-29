const functions = require('firebase-functions');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const firebaseAdmin = require('firebase-admin');
const { PubSub } = require('@google-cloud/pubsub');

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

  response.json({ championsMap });
});
