
select DATABASE();
use cis440fall2025team5;

-- 1) Drop tables if they exist (safe order due to foreign keys)
-- ========================================
DROP TABLE IF EXISTS workouts;
DROP TABLE IF EXISTS exercises;
DROP TABLE IF EXISTS `user`;


-- ========================================
-- 2) Create `user` table (matches server queries)
--    Contains login metadata: last_login, login_count, last_ip, refresh_token_hash
-- ========================================
CREATE TABLE IF NOT EXISTS `user` (
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


-- Add this AFTER dropping tables and BEFORE creating user table

-- ========================================
-- 3) Create Exercises table
-- ========================================
CREATE TABLE IF NOT EXISTS exercises (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    workout_name VARCHAR(255) NOT NULL,
    workout_date DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, workout_date)
);

-- ========================================
-- 4) Create Workouts table
-- ========================================
CREATE TABLE IF NOT EXISTS workouts (
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




INSERT INTO `user` (email, username, password, display_name) VALUES
    ('alice@example.com','alice','hash1','Alice'),
    ('bob@example.com','bob','hash2','Bob'),
    ('carol@example.com','carol','hash3','Carol');



INSERT INTO exercises (name, category, default_unit) VALUES
    ('Push-up','strength','reps'),
    ('Squat','strength','reps'),
    ('Running','cardio','km');



INSERT INTO workouts (user_id, exercise_id, sets, reps, weight, duration_minutes, distance_km) VALUES
    (1,1,3,15,NULL,NULL,NULL),
    (2,2,3,12,50.00,NULL,NULL),
    (3,3,NULL,NULL,NULL,30.00,5.00);


SELECT id, email, username, display_name, last_login, login_count FROM `user` LIMIT 10;
SELECT * FROM user;



