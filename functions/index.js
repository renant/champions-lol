const functions = require('firebase-functions');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const firebaseAdmin = require('firebase-admin');

firebaseAdmin.initializeApp();
const db = firebaseAdmin.database();

const opGGBaseUrl = "https://br.op.gg/";
const opGGChampions = `${opGGBaseUrl}/champion/statistics`;
const oppGGChampionById = (id) => `${opGGBaseUrl}/champion/${id}/statistics`;


exports.fetchLolHeroes = functions.https.onRequest(async (_, response) => {
  const data = await fetch(opGGChampions)

  const html = await data.text();

  const $ = cheerio.load(html);

  const champions = $('.champion-index__champion-item').map((index, el) => {
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
