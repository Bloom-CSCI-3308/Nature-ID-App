CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,        -- auto-numbering id
  username VARCHAR(50) UNIQUE NOT NULL,
  password CHAR(60) NOT NULL,        -- bcrypt hashes are 60 characters
  points INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plants (
  plant_id SERIAL PRIMARY KEY,
  common_name VARCHAR(100) NOT NULL,
  scientific_name VARCHAR(150) UNIQUE NOT NULL,
  plant_description VARCHAR(500) NOT NULL
);

CREATE TABLE IF NOT EXISTS users_to_plants (
  user_plant_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  plant_id INT NOT NULL REFERENCES plants(plant_id) ON DELETE CASCADE,
  location VARCHAR(100),
  found_at TIMESTAMP DEFAULT NOW(),
  image_path VARCHAR(300)
);
CREATE TABLE IF NOT EXISTS badges (
badge_id SERIAL PRIMARY KEY,
badge_name VARCHAR(50),
badge_description VARCHAR(200),
badge_requirements INT NOT NULL
);

CREATE TABLE IF NOT EXISTS users_to_badges (
PRIMARY KEY (user_id, badge_id),
user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
badge_id INT NOT NULL REFERENCES badges(badge_id) ON DELETE CASCADE,
obtained_at TIMESTAMP DEFAULT NOW()
);
