document.addEventListener('DOMContentLoaded', function () {
    const boosterContainer = document.getElementById('boosterContainer');
    const albumContainer = document.getElementById('albumContainer');
    const openBoosterBtn = document.getElementById('openBoosterBtn');
    const totalCardsIndicator = document.getElementById('totalCardsIndicator');
    const boosterCounter = document.getElementById('counterValue'); // Nouveau compteur

    // Stocker le nombre total de cartes possédées dans un objet
    const totalCardCount = {};

    openBoosterBtn.addEventListener('click', openBooster);
	const sellDuplicatesBtn = document.getElementById('sellDuplicatesBtn');
    sellDuplicatesBtn.addEventListener('click', sellDuplicates);

function openBooster() {
    // Vérifier si le solde est suffisant pour acheter un booster
    if (flowerOfHibiscus >= boosterCost) {
        // Déduire le coût du booster du solde de la monnaie virtuelle
        flowerOfHibiscus -= boosterCost;
        
        boosterContainer.innerHTML = ""; // Effacer les cartes actuelles du booster

        const cardIndexes = generateRandomIndexes(5); // Générer 5 indexes aléatoires
        for (let i = 0; i < 5; i++) {
            const cardIndex = cardIndexes[i];
            const card = createCard(cardIndex);
            boosterContainer.appendChild(card);

            // Ajouter la classe 'opened' pour déclencher l'animation
            setTimeout(() => {
                card.classList.add('opened');
                // Ajouter la carte à l'album lorsqu'elle est ouverte
                addToAlbum(cardIndex);
            }, i * 100);
        }
    } else {
        alert("Solde insuffisant pour acheter un booster.");
    }
    
    // Mettre à jour l'affichage du solde de la monnaie virtuelle
    updateFlowerOfHibiscusDisplay();
}
	
	// Fonction pour générer des indexes aléatoires avec probabilités de rareté
    function generateRandomIndexes(numCards) {
        const indexes = [];
        for (let i = 0; i < numCards; i++) {
            const rarityRoll = Math.random() * 100; // Roll de rareté de 0 à 100

            let rarity;
            if (rarityRoll <= 0.1) {
                rarity = 'SSS';
            } else if (rarityRoll <= 1.1) {
                rarity = 'SPlus';
            } else if (rarityRoll <= 6.1) {
                rarity = 'S';
            } else if (rarityRoll <= 16.1) {
                rarity = 'A';
            } else if (rarityRoll <= 36.1) {
                rarity = 'B';
            } else if (rarityRoll <= 61.1) {
                rarity = 'C';
            } else {
                rarity = 'D';
            }

            // Filtrer les cartes de cette rareté et en choisir une au hasard
            const filteredCards = cardData.cards.filter(card => card.rarity === rarity);
            const randomIndex = Math.floor(Math.random() * filteredCards.length);

            indexes.push(filteredCards[randomIndex].id);
        }
        return indexes;
    }


    // Fonction pour créer une carte avec l'index donné
    function createCard(cardIndex) {
        const card = document.createElement('div');
        card.classList.add('card');
        card.setAttribute('draggable', 'true'); // Rend la carte draggable

        card.dataset.cardIndex = cardIndex; // Ajoute un attribut de données pour stocker l'index

        const cardInner = document.createElement('div');
        cardInner.classList.add('card-inner');

        const cardFace = document.createElement('div');
        cardFace.classList.add('card-face');
        cardFace.style.backgroundImage = `url('Card${cardIndex} (Front).jpg')`;

        const cardBack = document.createElement('div');
        cardBack.classList.add('card-back');
        cardBack.style.backgroundImage = `url('Card${cardIndex} (Back).jpg')`;

        cardInner.appendChild(cardFace);
        cardInner.appendChild(cardBack);
        card.appendChild(cardInner);

        // Ajouter des gestionnaires d'événements pour le glisser-déposer
        card.addEventListener('dragstart', handleDragStart);

        return card;
    }

    // Fonction pour ajouter une carte à l'album
    function addToAlbum(cardIndex) {
        // Vérifier si la carte est déjà présente dans l'album
        if (totalCardCount[cardIndex]) {
            // Si oui, augmenter le nombre total de cartes possédées
            totalCardCount[cardIndex]++;
            // Mettre à jour le texte pour refléter le nombre total de cartes
            updateAlbumCardText(cardIndex);
        } else {
            // Si non, initialiser le nombre total de cartes possédées à 1
            totalCardCount[cardIndex] = 1;
            // Ajouter la carte à l'album
            createAlbumCard(cardIndex);
        }

        // Trier l'album après chaque ajout
        sortAlbum();
    }

    // Fonction pour trier les cartes dans l'album par ordre croissant
    function sortAlbum() {
        const albumCards = Array.from(albumContainer.children);
        albumCards.sort((a, b) => {
            const indexA = parseInt(a.id.split('_')[1]);
            const indexB = parseInt(b.id.split('_')[1]);
            return indexA - indexB;
        });

        // Retirer toutes les cartes de l'album
        albumContainer.innerHTML = "";

        // Ajouter les cartes triées à l'album
        albumCards.forEach(card => {
            albumContainer.appendChild(card);
        });

        // Mettre à jour l'indicateur total après le tri
        updateTotalCardsIndicator();
    }

    // Fonction pour mettre à jour le texte sur la carte de l'album et l'indicateur total
    function updateAlbumCardText(cardIndex) {
        const albumCard = document.getElementById(`albumCard_${cardIndex}`);
        // Mettre à jour le texte pour refléter le nombre total de cartes
        albumCard.textContent = `${cardIndex} x${totalCardCount[cardIndex]}`;

        // Mettre à jour l'indicateur total
        updateTotalCardsIndicator();
    }
	
	// Fonction pour mettre à jour l'indicateur total
    function updateTotalCardsIndicator() {
        const uniqueCardsCount = Object.keys(totalCardCount).length;
        totalCardsIndicator.textContent = `Total : ${uniqueCardsCount} / 50 cartes`;
    }

    // Fonction pour créer une carte dans l'album
    function createAlbumCard(cardIndex) {
        // Utiliser la face avant de la carte si c'est la face arrière qui est dropée
        const cardFace = document.createElement('div');
        cardFace.classList.add('album-card-face');
        cardFace.style.backgroundImage = `url('Card${cardIndex} (Front).jpg')`;

        // Créer la carte de l'album
        const albumCard = document.createElement('div');
        albumCard.classList.add('album-card');
        albumCard.id = `albumCard_${cardIndex}`;
        albumCard.appendChild(cardFace);

        // Ajouter l'image de la carte dans l'album
        const cardImage = new Image();
        cardImage.src = `Card${cardIndex} (Front).jpg`;
        cardImage.alt = `Card ${cardIndex}`;
        albumCard.appendChild(cardImage);

        // Afficher le nombre total de cartes possédées
        albumCard.textContent = `${cardIndex} x${totalCardCount[cardIndex]}`;

        albumContainer.appendChild(albumCard);
    }

    // Gestionnaire d'événement pour le drag and drop
    function handleDragStart(event) {
        event.dataTransfer.setData('text/plain', event.target.dataset.cardIndex);
    }

    function allowDrop(event) {
        event.preventDefault();
    }

    function handleDrop(event) {
        event.preventDefault();
        const cardIndex = event.dataTransfer.getData('text/plain');
        addToAlbum(cardIndex);
    }
	
	// Monnaie virtuelle
let flowerOfHibiscus = 500;

   // Coût d'un booster
const boosterCost = 50;

// Fonction pour vendre les cartes en double à l'agent virtuel
function sellDuplicates() {
    for (const cardIndex in totalCardCount) {
        if (totalCardCount[cardIndex] > 1) {
            const sellingPrice = calculateSellingPrice(cardIndex);
            flowerOfHibiscus += sellingPrice * (totalCardCount[cardIndex] - 1);

            // Soustraire le nombre de cartes vendues du total
            totalCardCount[cardIndex] = 1;

            // Mettre à jour le texte pour refléter le nombre total de cartes
            updateAlbumCardText(cardIndex);
        }
    }

    // Mettre à jour l'affichage du solde de la monnaie virtuelle
    updateFlowerOfHibiscusDisplay();
}

// Fonction pour calculer le prix de vente d'une carte en fonction de sa rareté
function calculateSellingPrice(cardIndex) {
    const rarity = getCardRarity(cardIndex);
    switch (rarity) {
        case 'SSS':
            return 100;
        case 'SPlus':
            return 75;
        case 'S':
            return 50;
        case 'A':
            return 25;
        case 'B':
            return 15;
        case 'C':
            return 10;
        case 'D':
            return 5;
        default:
            return 0;
    }
}

// Fonction pour récupérer la rareté d'une carte en fonction de son index
function getCardRarity(cardIndex) {
    const card = cardData.cards.find(card => card.id === parseInt(cardIndex));
    return card ? card.rarity : '';
}

// Fonction pour mettre à jour l'affichage du solde de la monnaie virtuelle
function updateFlowerOfHibiscusDisplay() {
    const flowerOfHibiscusDisplay = document.getElementById('flowerOfHibiscusDisplay');
    flowerOfHibiscusDisplay.textContent = `Fleur de Bissap : ${flowerOfHibiscus}`;
}

});

const cardData = {
  "SSS": 0.1,
  "SPlus": 1,
  "S": 5,
  "A": 10,
  "B": 20,
  "C": 25,
  "D": 39,
  "cards": [
    {"id": 0, "rarity": "C"},
    {"id": 1, "rarity": "A"},
    {"id": 2, "rarity": "SPlus"},
    {"id": 3, "rarity": "D"},
    {"id": 4, "rarity": "D"},
    {"id": 5, "rarity": "C"},
    {"id": 6, "rarity": "S"},
    {"id": 7, "rarity": "A"},
    {"id": 8, "rarity": "D"},
    {"id": 9, "rarity": "A"},
    {"id": 10, "rarity": "D"},
    {"id": 11, "rarity": "S"},
    {"id": 12, "rarity": "C"},
    {"id": 13, "rarity": "A"},
    {"id": 14, "rarity": "A"},
    {"id": 15, "rarity": "SPlus"},
    {"id": 16, "rarity": "S"},
    {"id": 17, "rarity": "C"},
    {"id": 18, "rarity": "D"},
    {"id": 19, "rarity": "SPlus"},
    {"id": 20, "rarity": "A"},
    {"id": 21, "rarity": "S"},
    {"id": 22, "rarity": "B"},
    {"id": 23, "rarity": "B"},
	{"id": 24, "rarity": "A"},
    {"id": 25, "rarity": "D"},
    {"id": 26, "rarity": "D"},
    {"id": 27, "rarity": "SSS"},
    {"id": 28, "rarity": "SPlus"},
    {"id": 29, "rarity": "S"},
    {"id": 30, "rarity": "S"},
    {"id": 31, "rarity": "B"},
    {"id": 32, "rarity": "SPlus"},
    {"id": 33, "rarity": "A"},
    {"id": 34, "rarity": "S"},
    {"id": 35, "rarity": "S"},
    {"id": 36, "rarity": "S"},
    {"id": 37, "rarity": "C"},
    {"id": 38, "rarity": "B"},
    {"id": 39, "rarity": "SSS"},
    {"id": 40, "rarity": "S"},
    {"id": 41, "rarity": "A"},
    {"id": 42, "rarity": "B"},
    {"id": 43, "rarity": "S"},
    {"id": 44, "rarity": "C"},
    {"id": 45, "rarity": "S"},
    {"id": 46, "rarity": "A"},
    {"id": 47, "rarity": "S"},
    {"id": 48, "rarity": "B"},
    {"id": 49, "rarity": "S"},
	{"id": 50, "rarity": "SSS"},
  ]
};
