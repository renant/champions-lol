const functions = require('firebase-functions');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const firebaseAdmin = require('firebase-admin');

firebaseAdmin.initializeApp();
const db = firebaseAdmin.database();

const opGGBaseUrl = "https://br.op.gg/";
const opGGChampions = `${opGGBaseUrl}/champion/statistics`;
const championById = (id) => `https://www.leagueofgraphs.com/pt/champions/counters/${id}`;
const championMainContentById = (id) => `https://www.leagueofgraphs.com/pt/champions/builds/${id}`;

exports.fetchLolChampion = functions.https.onRequest(async (request, response) => {
  const { id } = request.query

  if (!id) {
    response.status(400).json({ message: 'Missing id query param' })
    return;
  }

  const data = await fetch(championById(id))
  if (!data.ok) {
    response.status(404).json({ message: 'Champion not found' })
    return;
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

  // const imageUrl = $('.champion-stats-header-info__image img').attr('src');
  let winRate = $main('#graphDD2').text();

  if (winRate) {
    winRate = parseFloat(winRate.trim());
  }

  // const pickRate = $('.champion-stats-trend-rate').last().text();

  // console.log(html);

  const champion = {
    id,
    winRate,
    winner: {},
    losses: {},
    wellWith: {}
  }


  $('.box').map((index, el) => {

    $(el).find('tr').map((_, matchChampion) => {
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

  }).toArray();

  const championsRef = db.ref('/champions').child(id);
  await championsRef.update(champion);

  response.json({
    champion
  });

});

exports.fetchLolChampions = functions.https.onRequest(async (_, response) => {
  const data = await fetch(opGGChampions)
  const html = await data.text();
  const $ = cheerio.load(html);

  const champions = $('.champion-index__champion-item').map((_, el) => {
    const name = $(el).find('.champion-index__champion-item__name').text();
    const id = $(el).attr('data-champion-key');
    const lanes = $(el).find('.champion-index__champion-item__positions').text();

    //const id = name.toLowerCase().replace(' ', '');
    return {
      id,
      name,
      lanes: lanes.replace(/(\r\n|\n|\r)/gm, "").match(/[A-Z][a-z]+/g)
    }
  }).toArray();

  const championsMap = {}
  champions.forEach(hero => {
    Object.keys(hero).forEach(attr => {
      championsMap[`${hero.id}/${attr}`] = hero[attr]
    })
  })

  const championsRef = db.ref('/champions');
  await championsRef.update(championsMap);

  response.json({ championsMap });
});
