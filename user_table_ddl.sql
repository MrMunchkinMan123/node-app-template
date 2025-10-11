select DATABASE();
use cis440fall2025team5;
select * from users where username='alice';
-- ========================================
-- 1️⃣ Drop tables if they exist (safe order due to foreign keys)
-- ========================================
DROP TABLE IF EXISTS workouts;
DROP TABLE IF EXISTS exercises;
DROP TABLE IF EXISTS users;

-- ========================================
-- 2️⃣ Create Users table
-- ========================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 3️⃣ Create Exercises table
-- ========================================
CREATE TABLE IF NOT EXISTS exercises (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    category ENUM('strength', 'cardio') NOT NULL,
    default_unit VARCHAR(20), -- e.g., 'reps', 'minutes', 'km'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 4️⃣ Create Workouts table
-- ========================================
CREATE TABLE IF NOT EXISTS workouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    exercise_id INT NOT NULL,
    sets INT,
    reps INT,
    weight DECIMAL(6,2),
    duration_minutes DECIMAL(5,2),
    distance_km DECIMAL(5,2),
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

-- ========================================
-- 5️⃣ Insert sample users
-- ========================================
INSERT INTO users (username, email, password_hash) VALUES
('alice', 'alice@example.com', 'hash1'),
('bob', 'bob@example.com', 'hash2'),
('carol', 'carol@example.com', 'hash3');

-- ========================================
-- 6️⃣ Insert sample exercises
-- ========================================
INSERT INTO exercises (name, category, default_unit) VALUES
('Push-up', 'strength', 'reps'),
('Squat', 'strength', 'reps'),
('Running', 'cardio', 'km');

-- ========================================
-- 7️⃣ Insert sample workouts
-- ========================================
INSERT INTO workouts (user_id, exercise_id, sets, reps, weight, duration_minutes, distance_km) VALUES
-- Alice does 3 sets of 15 push-ups
(1, 1, 3, 15, NULL, NULL, NULL),
-- Bob squats 3 sets of 12 reps with 50kg
(2, 2, 3, 12, 50.00, NULL, NULL),
-- Carol runs 5km in 30 minutes
(3, 3, NULL, NULL, NULL, 30.00, 5.00);
