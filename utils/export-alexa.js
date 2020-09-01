const champions = require('../champions-lol-champions-export.json');

const example = [
  {
    "id": "lulu",
    "name": {
      "value": "lulu",
      "synonyms": [
        "Lulu"
      ]
    }
  },
  {
    "id": "aatrox",
    "name": {
      "value": "aatrox",
      "synonyms": [
        "Aatrox"
      ]
    }
  }
];

const words = new Set();

const output = Object.keys(champions).map(id => {
  const { name } = champions[id];
  if (!id) {
    { return }
  }

  if (!name) { return }

  const synonyms = new Set()
  synonyms.add(name);
  const parts = name.split(' ');
  parts.forEach(p => {
    if (!words.has(p)) {
      synonyms.add(p)
      words.add(p)
    }
  })

  return {
    id: id,
    name: {
      value: id,
      synonyms: Array.from(synonyms.values())
    }
  }
})

console.log(JSON.stringify(output, null, 2));