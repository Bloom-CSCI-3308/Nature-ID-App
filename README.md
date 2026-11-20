# 🌱 Bloom

**Try Bloom live:** [https://nature-id-app.onrender.com/login](https://nature-id-app.onrender.com/login)

Bloom is an interactive plant-tracking app that gets people outside to discover the wild flora of their own region. Users receive a personalized checklist of plants found in their state or region, photograph each plant in the real world, and the app confirms the match using plant identification. Every confirmed find is saved to the user's account, building a personal field guide over time.

Instead of asking "what is this plant?", Bloom asks "which plants can I find?" and turns exploration into a collecting game.

## Features

- **Regional checklists:** A personalized list of plants found in your state or region
- **Photo identification:** Upload a photo and Bloom verifies it against the target species using the Pl@ntNet API, with organ prediction for leaf, flower, fruit, and bark
- **Personal collection:** Every confirmed find is stored in your account with the date and a rough location, in your Bloomdex
- **Plant profiles:** Photos, identifying features, habitat notes, family, type, and IUCN status for each plant
- **Progress tracking:** Progress bars and badges for completing regional or habitat lists
- **Rarity tiers:** Every plant is Common, Rare, or Legendary, based on its IUCN status, with a matching organ icon
- **Awards:** Six badge tiers for total plants found, from First Find to Divine Phytologist, with earned badges in color and locked badges in grey
- **Bloom Bear:** An AI assistant on the plant detail page that answers questions about that plant
- **User accounts:** Sign up, log in, and keep your collection saved
- **Settings:** Account, notifications, privacy, appearance, and about pages, with a back button that follows your navigation history

## Rarity

Rarity is driven by IUCN status, not by guesswork.

| Rarity | IUCN status |
|--------|-------------|
| Common | common |
| Rare | rare |
| Legendary | super rare |

If a plant has no IUCN status, rarity falls back to how many users have found it, capped at Rare, so an unknown plant is never Legendary. Each organ, leaf, flower, fruit, and bark, has its own icon in each rarity tier, 12 icons in total, in `Assets/`.

## Awards

Awards unlock automatically as your total plant count grows. Clicking an earned badge opens a detail view with its name, description, plant count, and the date you earned it. Locked badges do not open.

| Badge | Name | Plants needed |
|-------|------|---------------|
| Star | First Find | 1 |
| Medal | Trail Scout | 5 |
| Trophy | Field Botanist | 20 |
| Book | Master Naturalist | 250 |
| Crown | Legendary Botanist | 1000 |
| Lily | Divine Phytologist | 10000 |

Badge images live in `Assets/badges/`, with a color version and a grey locked version for each badge.

## Bloom Bear

Bloom Bear is the AI assistant on the plant detail page. Ask it about the plant you are looking at, and it answers in 2 to 4 short, friendly sentences, in plain text, staying on that plant. It will say it is unsure rather than guess, and it will never say a plant is safe to eat, touch, or use as medicine.

Bloom Bear runs on the server through the Google Gemini API. The API key stays server side only, in the environment, and is never sent to the browser.

## Plant Catalogue

Bloom ships with a catalogue of 1,000 plant species, 998 distinct, with family, common type, IUCN status, and IUCN rarity for each plant. Plant detail pages show family, type, and IUCN information, and the first Pl@ntNet identification backfills the real common name for a plant.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Front end | HTML, CSS, Bootstrap, Handlebars |
| Back end | Node.js, Express |
| Database | PostgreSQL |
| Plant identification | [Pl@ntNet API](https://my.plantnet.org/) |
| AI assistant | Google Gemini API |
| Local development | Docker, Docker Compose |
| Live hosting | Render |

## How It Works

1. A user creates an account and selects their state or region.
2. Bloom generates a checklist of plants for that region.
3. The user finds a plant outdoors and uploads a photo from the camera page.
4. The server sends the photo to the Pl@ntNet API for identification, and Pl@ntNet predicts the organ, leaf, flower, fruit, or bark.
5. If the result matches the target plant, it is saved to the user's collection in the database, with the photo, organ, date, and location.
6. Saving a plant updates the user's total count, rarity icon, and awards. Newly unlocked badges appear on the Rewards page.
7. On a plant detail page, the user can ask Bloom Bear questions about that plant.

## Project Structure

```
Bloom/
├── Assets/                 # Logo, organ icons, badge images, and other images
├── MilestoneSubmissions/   # Course milestone deliverables
├── TeamMeetingLogs/        # Team meeting notes
├── ProjectSourceCode/
│   ├── src/
│   │   ├── index.js            # Express entry point, routes, auth, rewards, collection
│   │   ├── plant-chat.js       # Bloom Bear route, POST /api/plant-chat
│   │   ├── identify.js         # Pl@ntNet identification
│   │   ├── db.js               # Database connection
│   │   ├── mailer.js           # Password reset email
│   │   ├── views/              # Handlebars pages and partials
│   │   ├── resources/          # Client-side JS, CSS, images, uploads
│   │   └── init_data/          # SQL schema and seed files
│   ├── docker-compose.yml      # Web and database services
│   └── .env                    # Environment variables (not committed)
└── README.md
```

The app listens on port 3000 in the container. With Docker Compose, it is mapped to port 3001 on the host, so local development uses http://localhost:3001. The database is named `users_db`.

## Running Locally

1. Copy the environment file and set your keys:
   - `PLANTNET_API_KEY` for Pl@ntNet identification
   - `GEMINI_API_KEY` for Bloom Bear
   - `GEMINI_MODEL=gemini-3.5-flash-lite`
2. Start the app and database with Docker Compose from `ProjectSourceCode`:
   - `docker compose up -d --build`
3. Open http://localhost:3001 and create an account.

Do not use `docker compose down -v`, it deletes the database volume and all users and collections with it.

## Safety and Responsibility

- Never pick, dig up, or disturb plants. Look, don't pick.
- Stay on trails and respect private property.
- Some plants are toxic (poison ivy, poison oak, water hemlock). Do not touch unfamiliar plants.
- Never eat a plant based on an app result. Plant identification is not always accurate.

## Future Plans

- Seasonal bloom highlights
- Badges and streaks
- Blurred locations for rare or protected species
- Friends and leaderboards
- Multi-region support

## Authors

- Nicholas Gowin
- Simon Logan
- Tariq Ahmad
- Justin Pleva
- Akshay

## Acknowledgments

- [Pl@ntNet](https://plantnet.org/) for the plant identification API
- [Bootstrap](https://getbootstrap.com/) for front-end components
