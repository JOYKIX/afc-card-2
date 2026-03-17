const form = document.getElementById('cardForm');
const rollStatsBtn = document.getElementById('rollStats');
const downloadCardBtn = document.getElementById('downloadCard');
const imageInput = document.getElementById('imageInput');
const portrait = document.getElementById('portrait');

const fields = {
  number: document.getElementById('number'),
  edition: document.getElementById('edition'),
  name: document.getElementById('name'),
  title: document.getElementById('title'),
  level: document.getElementById('level'),
  abilities: document.getElementById('abilities'),
  archetype: document.getElementById('archetype')
};

const output = {
  number: document.getElementById('cardNumber'),
  edition: document.getElementById('cardEdition'),
  name: document.getElementById('cardName'),
  title: document.getElementById('cardTitle'),
  level: document.getElementById('cardLevel'),
  abilities: document.getElementById('cardAbilities'),
  type: document.getElementById('cardType'),
  rank: document.getElementById('cardRank'),
  attack: document.getElementById('attack'),
  defense: document.getElementById('defense')
};

let attack = 0;
let defense = 0;

const rankFromScore = (score) => {
  if (score >= 90) return 'SS';
  if (score >= 80) return 'S';
  if (score >= 70) return 'A';
  if (score >= 58) return 'B';
  if (score >= 45) return 'C';
  return 'D';
};

const computeType = () => {
  if (fields.archetype.value !== 'auto') return fields.archetype.value;
  return attack >= defense ? 'attaquant' : 'tank';
};

const weightedAverage = () => {
  const atkWeight = attack > defense ? 1.5 : 1;
  const defWeight = defense > attack ? 1.5 : 1;
  return ((attack * atkWeight) + (defense * defWeight)) / (atkWeight + defWeight);
};

const render = () => {
  output.number.textContent = fields.number.value;
  output.edition.textContent = fields.edition.value;
  output.name.textContent = fields.name.value;
  output.title.textContent = fields.title.value;
  output.level.textContent = fields.level.value;
  output.abilities.textContent = fields.abilities.value;

  const average = weightedAverage();
  output.rank.textContent = rankFromScore(average);
  output.type.textContent = computeType();
  output.attack.textContent = attack;
  output.defense.textContent = defense;
};

const rollStats = () => {
  attack = Math.floor(Math.random() * 61) + 30;
  defense = Math.floor(Math.random() * 61) + 30;
  render();
};

form.addEventListener('input', render);
fields.archetype.addEventListener('change', render);
rollStatsBtn.addEventListener('click', rollStats);

imageInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const valid = ['image/jpeg', 'image/webp'].includes(file.type);
  if (!valid) {
    alert('Format refusé. Utilise JPG/JPEG ou WEBP (pas de PNG).');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    portrait.style.backgroundImage = `url('${e.target.result}')`;
  };
  reader.readAsDataURL(file);
});

downloadCardBtn.addEventListener('click', async () => {
  if (!window.html2canvas) {
    alert('Export indisponible: html2canvas non chargé.');
    return;
  }

  const card = document.getElementById('afcCard');
  const canvas = await window.html2canvas(card, { backgroundColor: null, scale: 2 });
  const link = document.createElement('a');
  link.download = `${fields.name.value || 'afc-card'}.jpg`;
  link.href = canvas.toDataURL('image/jpeg', 0.94);
  link.click();
});

const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
script.defer = true;
document.head.appendChild(script);

rollStats();
render();
