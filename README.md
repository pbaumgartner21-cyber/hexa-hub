# HEXA_HUB Discord Bot

Bot Discord structure pour HEXA_HUB avec:

- `/reglement` qui poste le reglement dans le salon `1504979960501243976`
- message automatique de bienvenue dans le salon `1504979963579994205`
- `/mises-a-jour` qui poste une annonce dans le salon `1504979966994022431`
- `/comptes` qui poste un panel avec boutons dans le salon `1507381884945174760`
- `/status` qui poste l'etat ouvert/ferme dans le salon `1506702782839918722`
- `/catalogue` qui poste le catalogue public dans le salon `1504979977798553782`
- `/catalogue-admin` qui poste la gestion admin dans le salon `1508127052040241282`
- `/vouch` qui poste le panel avis dans le salon `1507072193006403594`
- `/support` qui poste le panel support dans le salon ou la commande est lancee
- `/argent` qui ajoute de l'argent au solde d'un membre
- logs automatiques dans le salon `1504980043145937047`
- annonce automatique dans le salon restock `1507378627338305558` quand tu publies de nouveaux produits ou du stock ajoute
- commandes stockees avec ID de commande pour les futurs avis clients
- notification admin quand un compte est cree dans le salon `1508122797161840761`
- reaction automatique `🐙` sur les embeds publics postes par le bot
- banniere en bas des embeds via `templates/banner.png`
- API web pour connecter ton site au bot quand il est heberge sur Render

## Installation

```bash
npm install
```

## Configuration

Remplis le fichier `.env`:

```env
DISCORD_TOKEN=ton_token_ici
CLIENT_ID=ton_client_id_ici
GUILD_ID=ton_guild_id_ici
```

Dans le portail Discord Developer, active aussi le privileged intent **Server Members Intent** pour que l'accueil des nouveaux membres fonctionne.

## Bannière

Place ton image dans:

```text
templates/banner.png
```

Le bot accepte aussi `banner.jpg`, `banner.jpeg`, `banner.webp`, `banniere.png`, `banniere.jpg`, `banniere.jpeg`, `banniere.webp`.

## Commandes Discord

Discord n'accepte pas les emojis dans les noms de slash commands. Les commandes sont donc:

```text
/reglement
/mises-a-jour
/comptes
/status
/catalogue
/catalogue-admin
/vouch
/support
/argent
/moderation
```

Pour deployer les commandes sur ton serveur:

```bash
npm run deploy
```

Pour lancer le bot:

```bash
npm start
```

## Mise a jour

La commande `/mises-a-jour` prend:

- `titre`: exemple `🚀 VERSION V1.1`
- `texte`: ton message, avec `\n` si tu veux forcer des retours a la ligne

## Comptes

La commande `/comptes` poste un embed avec deux boutons:

- `Créer un compte`: enregistre le membre dans `data/accounts.json`
- `Se connecter`: verifie que le membre possede deja un compte

Quand un compte est cree, le bot poste automatiquement une notification admin dans le salon configure par `ACCOUNT_LOGS_CHANNEL_ID`.

Les comptes crees depuis Discord demandent maintenant:

- email
- mot de passe

Le mot de passe n'est jamais stocke en clair. Le bot garde seulement un hash securise dans la data comptes.

## API site / Render

Le bot peut tourner en **Render Web Service**. Il reste connecte a Discord et ouvre aussi une API HTTP sur `PORT`.

Variables utiles:

```env
API_ENABLED=true
API_SECRET=change_moi_en_une_longue_cle_secrete
SITE_ORIGIN=https://ton-site.base44.app
```

Render fournit `PORT` automatiquement. En local tu peux utiliser:

```env
API_PORT=3000
```

Routes disponibles:

```text
GET  /health
GET  /api/catalogue
POST /api/auth/login
GET  /api/me
GET  /api/orders
POST /api/checkout
```

Connexion depuis le site:

```js
const response = await fetch('https://ton-bot.onrender.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const { token, account } = await response.json();
```

Lire le compte et les commandes:

```js
await fetch('https://ton-bot.onrender.com/api/me', {
  headers: { Authorization: `Bearer ${token}` }
});

await fetch('https://ton-bot.onrender.com/api/orders', {
  headers: { Authorization: `Bearer ${token}` }
});
```

Commander depuis le site:

```js
await fetch('https://ton-bot.onrender.com/api/checkout', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({
    items: [
      { productId: 'prd_snap_flammes_xxxxx', quantity: 1 }
    ],
    productDelivery: 'Produit livre: Snap flammes'
  })
});
```

Le backend verifie le solde, le stock, retire l'argent, retire le stock, cree la commande, puis poste la nouvelle commande dans Discord.

## Catalogue

Utilise `/catalogue-admin` dans Discord pour poster le panneau de gestion admin. Depuis ce panneau tu peux:

- ajouter une categorie
- supprimer une categorie
- ajouter un produit avec prix, stock, lien image et description
- modifier le stock d'un produit avec une valeur positive ou negative
- publier le catalogue public

Quand tu cliques sur `Publier`, le bot modifie le catalogue public et annonce automatiquement les nouveaux produits ou le stock ajoute dans le salon restock.

## Vouch

La commande `/vouch` poste le panel avis. Les clients cliquent sur `Poster un avis`, indiquent une note sur 5 et une description. Le bot envoie ensuite l'avis dans le salon de verification admin.

Quand un avis est valide:

- il est poste dans le salon vouch client
- le membre gagne `+0.05€` de solde
- les statistiques du panel avis sont mises a jour

## Support

La commande `/support` poste le panel support. Les clients choisissent un type de probleme, puis le bot cree un salon ticket dans la categorie `1507363577206542507`.

Renseigne `STAFF_ROLE_ID` dans `.env` pour que le bot ping le role staff et lui donne acces aux tickets. Si ce champ est vide, le bot essaie de trouver un role nomme `staff`.

Par defaut, `STAFF_ROLE_ID` vaut `1504979937268863006`. Ce role est ping dans les tickets, a acces aux tickets, et peut fermer les tickets avec le bouton `Fermer le ticket`.

## Logs

Le bot poste les logs importantes dans `MOD_LOG_CHANNEL_ID`:

- messages supprimes/modifies dans `LOG_MESSAGES_CHANNEL_ID`
- vocal dans `LOG_VOICE_CHANNEL_ID`
- tickets dans `LOG_TICKETS_CHANNEL_ID`
- moderation dans `LOG_MODERATION_CHANNEL_ID`
- boutique dans `LOG_SHOP_CHANNEL_ID`

## Donnees Discord

Les donnees runtime sont stockees dans les salons data Discord:

- accounts: `1508465065387626627`
- catalogue: `1508465069716013106`
- vouches: `1508465156785438780`
- orders: `1508465204680458471`

Le bot poste un fichier JSON dans chaque salon data et relit le dernier fichier au besoin. Il doit avoir acces a ces salons avec les permissions lire, envoyer, joindre des fichiers, lire historique et gerer les messages.

## Moderation

La commande `/moderation` poste un panel avec boutons:

- ban / unban
- kick
- mute / unmute
- avertir
- bloquer / debloquer boutique
- supprimer compte HEXA_HUB

## Commandes et avis

Quand un membre clique sur `Commander`, le bot cree une commande avec ID et retire `1` au stock du produit.

Pour poster un vouch, le membre doit avoir une commande sans avis. Il choisit la commande, puis met sa note et son avis. Dans la verification admin, le bot affiche le produit et l'ID de commande.
