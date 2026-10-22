# 🌱 Bloom

Bloom is an interactive plant-tracking app that gets people outside to discover the wild flora of their own region. Users receive a personalized checklist of plants found in their state or region, photograph each plant in the real world, and the app confirms the match using plant identification. Every confirmed find is saved to the user's account, building a personal field guide over time.

Instead of asking "what is this plant?", Bloom asks "which plants can I find?" and turns exploration into a collecting game.

## Features

- **Regional checklists:** A personalized list of plants found in your state or region
- **Photo identification:** Upload a photo and Bloom verifies it against the target species using the Pl@ntNet API
- **Personal collection:** Every confirmed find is stored in your account with the date and a rough location
- **Plant profiles:** Photos, identifying features, and habitat notes for each plant
- **Progress tracking:** Progress bars and badges for completing regional or habitat lists
- **User accounts:** Sign up, log in, and keep your collection saved

## Tech Stack

| Layer | Technology |
|-------|------------|
| Front end | HTML, CSS, Bootstrap |
| Back end | Node.js |
| Database | SQL |
| Plant identification | [Pl@ntNet API](https://my.plantnet.org/) |

## How It Works

1. A user creates an account and selects their state or region.
2. Bloom generates a checklist of plants for that region.
3. The user finds a plant outdoors and uploads a photo.
4. The server sends the photo to the Pl@ntNet API for identification.
5. If the result matches the target plant, it's saved to the user's collection in the database.

## Project Structure

```
bloom/
├── public/          # HTML, CSS, client-side JS, images
├── routes/          # Express routes
├── database/        # SQL schema and seed files
├── server.js        # Node.js entry point
├── .env             # Environment variables (not committed)
└── README.md
```

> Update this section to match your actual folder layout.

## Safety and Responsibility

- Never pick, dig up, or disturb plants. Look, don't pick.
- Stay on trails and respect private property.
- Some plants are toxic (poison ivy, poison oak, water hemlock). Do not touch unfamiliar plants.
- Never eat a plant based on an app result. Plant identification is not always accurate.

## Future Plans

- Rarity tiers and seasonal bloom highlights
- Badges and streaks
- Blurred locations for rare or protected species
- Friends and leaderboards
- Multi-region support

## Authors

- Nicholas Gowin
- Simon Logan
- Tariq Ahmad
- Justin
- Akshay

## Acknowledgments

- [Pl@ntNet](https://plantnet.org/) for the plant identification API
- [Bootstrap](https://getbootstrap.com/) for front-end components
