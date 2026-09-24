import type { Lang } from "./i18n.ts";

type T = Record<Lang, string>;
const w = (en: string, fr: string, de: string): T => ({ en, fr, de });

// optional topics are not selected by default (players opt in)
export const MORE_TOPICS: { id: string; icon: string; name: T; words: T[]; optional?: boolean }[] = [
  {
    id: "music", icon: "Music",
    name: w("Music", "Musique", "Musik"),
    words: [
      w("Piano", "Piano", "Klavier"), w("Drums", "Batterie", "Schlagzeug"), w("Concert", "Concert", "Konzert"),
      w("Violin", "Violon", "Geige"), w("Karaoke", "Karaoké", "Karaoke"), w("Headphones", "Écouteurs", "Kopfhörer"),
      w("Choir", "Chorale", "Chor"), w("Trumpet", "Trompette", "Trompete"), w("DJ", "DJ", "DJ"),
      w("Festival", "Festival", "Festival"), w("Microphone", "Micro", "Mikrofon"), w("Opera", "Opéra", "Oper"),
    ],
  },
  {
    id: "swiss", icon: "Mountain",
    name: w("Switzerland", "Suisse", "Schweiz"),
    words: [
      w("Matterhorn", "Cervin", "Matterhorn"), w("Raclette", "Raclette", "Raclette"), w("Cowbell", "Cloche de vache", "Kuhglocke"),
      w("Swiss Army knife", "Couteau suisse", "Sackmesser"), w("Cable car", "Téléphérique", "Seilbahn"), w("Rösti", "Rösti", "Rösti"),
      w("Alphorn", "Cor des Alpes", "Alphorn"), w("Lake Geneva", "Lac Léman", "Genfersee"), w("Train station", "Gare", "Bahnhof"),
      w("Watch", "Montre", "Armbanduhr"), w("Yodeling", "Yodel", "Jodeln"), w("Toblerone", "Toblerone", "Toblerone"),
    ],
  },
  {
    id: "home", icon: "House",
    name: w("At home", "À la maison", "Zuhause"),
    words: [
      w("Fridge", "Frigo", "Kühlschrank"), w("Sofa", "Canapé", "Sofa"), w("Bathtub", "Baignoire", "Badewanne"),
      w("Vacuum cleaner", "Aspirateur", "Staubsauger"), w("Washing machine", "Machine à laver", "Waschmaschine"), w("Balcony", "Balcon", "Balkon"),
      w("Oven", "Four", "Backofen"), w("Doorbell", "Sonnette", "Türklingel"), w("Stairs", "Escalier", "Treppe"),
      w("Remote control", "Télécommande", "Fernbedienung"), w("Blanket", "Couverture", "Decke"), w("Kettle", "Bouilloire", "Wasserkocher"),
    ],
  },
  {
    id: "nature", icon: "Trees",
    name: w("Nature", "Nature", "Natur"),
    words: [
      w("Volcano", "Volcan", "Vulkan"), w("Rainbow", "Arc-en-ciel", "Regenbogen"), w("Waterfall", "Cascade", "Wasserfall"),
      w("Desert", "Désert", "Wüste"), w("Glacier", "Glacier", "Gletscher"), w("Thunderstorm", "Orage", "Gewitter"),
      w("Forest", "Forêt", "Wald"), w("Island", "Île", "Insel"), w("Cave", "Grotte", "Höhle"),
      w("Mushroom", "Champignon", "Pilz"), w("Sunset", "Coucher de soleil", "Sonnenuntergang"), w("Snowflake", "Flocon de neige", "Schneeflocke"),
    ],
  },
  {
    id: "transport", icon: "Bike",
    name: w("Transport", "Transports", "Verkehr"),
    words: [
      w("Bicycle", "Vélo", "Velo"), w("Helicopter", "Hélicoptère", "Helikopter"), w("Submarine", "Sous-marin", "U-Boot"),
      w("Tram", "Tram", "Tram"), w("Hot-air balloon", "Montgolfière", "Heissluftballon"), w("Scooter", "Trottinette", "Trottinett"),
      w("Tractor", "Tracteur", "Traktor"), w("Rocket", "Fusée", "Rakete"), w("Taxi", "Taxi", "Taxi"),
      w("Sailboat", "Voilier", "Segelboot"), w("Ambulance", "Ambulance", "Krankenwagen"), w("Skateboard", "Skateboard", "Skateboard"),
    ],
  },
  {
    id: "fantasy", icon: "WandSparkles",
    name: w("Fantasy", "Fantastique", "Fantasy"),
    words: [
      w("Dragon", "Dragon", "Drache"), w("Unicorn", "Licorne", "Einhorn"), w("Wizard", "Sorcier", "Magier"),
      w("Vampire", "Vampire", "Vampir"), w("Mermaid", "Sirène", "Meerjungfrau"), w("Ghost", "Fantôme", "Gespenst"),
      w("Treasure", "Trésor", "Schatz"), w("Robot", "Robot", "Roboter"), w("Alien", "Extraterrestre", "Ausserirdischer"),
      w("Pirate", "Pirate", "Pirat"), w("Knight", "Chevalier", "Ritter"), w("Time machine", "Machine à remonter le temps", "Zeitmaschine"),
    ],
  },
  {
    id: "clothes", icon: "Shirt",
    name: w("Clothes", "Vêtements", "Kleider"),
    words: [
      w("Sunglasses", "Lunettes de soleil", "Sonnenbrille"), w("Pajamas", "Pyjama", "Pyjama"), w("Raincoat", "Imperméable", "Regenjacke"),
      w("Tie", "Cravate", "Krawatte"), w("Swimsuit", "Maillot de bain", "Badehose"), w("Gloves", "Gants", "Handschuhe"),
      w("High heels", "Talons hauts", "High Heels"), w("Cap", "Casquette", "Mütze"), w("Scarf", "Écharpe", "Schal"),
      w("Wedding dress", "Robe de mariée", "Hochzeitskleid"), w("Slippers", "Pantoufles", "Finken"), w("Belt", "Ceinture", "Gurt"),
    ],
  },
  {
    id: "hobbies", icon: "Palette",
    name: w("Hobbies", "Loisirs", "Hobbys"),
    words: [
      w("Painting", "Peinture", "Malen"), w("Fishing", "Pêche", "Fischen"), w("Camping", "Camping", "Zelten"),
      w("Chess", "Échecs", "Schach"), w("Gardening", "Jardinage", "Gärtnern"), w("Knitting", "Tricot", "Stricken"),
      w("Photography", "Photographie", "Fotografieren"), w("Baking", "Pâtisserie", "Backen"), w("Video games", "Jeux vidéo", "Videospiele"),
      w("Magic tricks", "Tours de magie", "Zaubertricks"), w("Puzzle", "Puzzle", "Puzzle"), w("Dancing", "Danse", "Tanzen"),
    ],
  },
  {
    id: "nerd", icon: "Glasses", optional: true,
    name: w("Nerd", "Geek", "Nerd"),
    words: [
      w("Algorithm", "Algorithme", "Algorithmus"), w("Pixel", "Pixel", "Pixel"), w("Router", "Routeur", "Router"),
      w("Firewall", "Pare-feu", "Firewall"), w("Data center", "Centre de données", "Rechenzentrum"), w("Password", "Mot de passe", "Passwort"),
      w("Bluetooth", "Bluetooth", "Bluetooth"), w("Hashtag", "Hashtag", "Hashtag"), w("Joystick", "Joystick", "Joystick"),
      w("Lightsaber", "Sabre laser", "Lichtschwert"), w("Hobbit", "Hobbit", "Hobbit"), w("Cyborg", "Cyborg", "Cyborg"),
      w("Hologram", "Hologramme", "Hologramm"), w("Motherboard", "Carte mère", "Mainboard"), w("Terminal", "Terminal", "Terminal"),
      w("Bug", "Bug", "Bug"), w("Glitch", "Glitch", "Glitch"), w("Avatar", "Avatar", "Avatar"),
      w("Emoji", "Emoji", "Emoji"), w("Spreadsheet", "Tableur", "Tabellenkalkulation"), w("Source code", "Code source", "Quellcode"),
      w("Comic book", "Bande dessinée", "Comic"), w("Keyboard shortcut", "Raccourci clavier", "Tastenkürzel"), w("Anime", "Anime", "Anime"),
      w("Cosplay", "Cosplay", "Cosplay"), w("Boss fight", "Combat de boss", "Bosskampf"), w("Save point", "Point de sauvegarde", "Speicherpunkt"),
      w("Wi-Fi", "Wi-Fi", "WLAN"), w("Computer virus", "Virus informatique", "Computervirus"), w("Hacker", "Hacker", "Hacker"),
      w("Binary code", "Code binaire", "Binärcode"), w("QR code", "QR code", "QR-Code"), w("USB stick", "Clé USB", "USB-Stick"),
      w("3D printer", "Imprimante 3D", "3D-Drucker"), w("Virtual reality", "Réalité virtuelle", "Virtuelle Realität"), w("DNA", "ADN", "DNA"),
      w("Periodic table", "Tableau périodique", "Periodensystem"), w("Twenty-sided die", "Dé à vingt faces", "Zwanzigseitiger Würfel"),
      w("Dungeon", "Donjon", "Verlies"), w("Smartwatch", "Montre connectée", "Smartwatch"),
    ],
  },
];
