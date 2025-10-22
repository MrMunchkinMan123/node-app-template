SELECT DATABASE();
USE cis440fall2025team5;

-- 1) Drop tables if they exist (CORRECT ORDER - child tables first!)
-- ========================================
DROP TABLE IF EXISTS workouts;           -- Drop this FIRST (has foreign key to workout_sessions)
DROP TABLE IF EXISTS workout_sessions;   -- Drop this SECOND (has foreign key to user)
DROP TABLE IF EXISTS exercises;          -- Drop this (no dependencies)
DROP TABLE IF EXISTS `user`;             -- Drop this LAST (parent table)

-- ========================================
-- 2) Create `user` table
-- ========================================
CREATE TABLE `user` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(50) DEFAULT NULL,
    password VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) DEFAULT NULL,
    bio TEXT DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    role VARCHAR(50) DEFAULT 'user',
    last_login DATETIME NULL,
    login_count INT NOT NULL DEFAULT 0,
    last_ip VARCHAR(45) NULL,
    refresh_token_hash VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (email),
    INDEX (username)
);

-- ========================================
-- 3) Create workout_sessions table
-- ========================================
CREATE TABLE workout_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    workout_name VARCHAR(255) NOT NULL,
    workout_date DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, workout_date)
);

-- ========================================
-- 4) Create workouts table
-- ========================================
CREATE TABLE workouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    workout_session_id INT NOT NULL,
    exercise_name VARCHAR(255) NOT NULL,
    exercise_type VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL,
    sets INT DEFAULT NULL,
    reps INT DEFAULT NULL,
    weight DECIMAL(8,2) DEFAULT NULL,
    duration INT DEFAULT NULL,
    distance DECIMAL(6,2) DEFAULT NULL,
    completed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
    INDEX idx_session (workout_session_id)
);

-- ========================================
-- 5) Insert sample users
-- ========================================
INSERT INTO `user` (email, username, password, display_name) VALUES
    ('alice@example.com','alice','$2a$10$XYZ','Alice'),
    ('bob@example.com','bob','$2a$10$ABC','Bob'),
    ('carol@example.com','carol','$2a$10$DEF','Carol');

-- ========================================
-- 6) Insert sample workout sessions
-- ========================================
INSERT INTO workout_sessions (user_id, workout_name, workout_date) VALUES
    (1, 'Morning Routine', '2025-10-20 08:00:00'),
    (2, 'Leg Day', '2025-10-21 18:00:00'),
    (3, 'Cardio Blast', '2025-10-22 07:00:00');

-- ========================================
-- 7) Insert sample workouts (exercises)
-- ========================================
INSERT INTO workouts (workout_session_id, exercise_name, exercise_type, category, sets, reps, weight) VALUES
    (1, 'Push-ups', 'bodyweight', 'bodyweight', 3, 15, NULL),
    (1, 'Pull-ups', 'bodyweight', 'bodyweight', 3, 10, NULL),
    (2, 'Squat', 'strength', 'strength', 4, 12, 135.00),
    (2, 'Leg Press', 'strength', 'strength', 3, 15, 200.00),
    (3, 'Running', 'cardio', 'cardio', NULL, NULL, NULL);

-- Update cardio exercise with duration and distance
UPDATE workouts SET duration = 30, distance = 3.5 WHERE exercise_name = 'Running';

-- ========================================
-- Verify the data
-- ========================================
SELECT 
    u.email,
    ws.workout_name,
    ws.workout_date,
    w.exercise_name,
    w.sets,
    w.reps,
    w.weight,
    w.duration,
    w.distance
FROM `user` u
JOIN workout_sessions ws ON u.id = ws.user_id
JOIN workouts w ON ws.id = w.workout_session_id
ORDER BY ws.workout_date DESC, w.id;
