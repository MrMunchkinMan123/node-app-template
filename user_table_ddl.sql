SELECT DATABASE();
USE cis440fall2025team5;

DROP TABLE IF EXISTS workouts;
DROP TABLE IF EXISTS workout_sessions;
DROP TABLE IF EXISTS exercises;
DROP TABLE IF EXISTS `user`;

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

CREATE TABLE workout_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    workout_name VARCHAR(255) NOT NULL,
    workout_date DATETIME NOT NULL,
    completed_at DATETIME DEFAULT NULL,
    completion_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, completed_at)
);

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

INSERT INTO `user` (email, username, password, display_name) VALUES
    ('alice@example.com','alice','$2a$10$XYZ','Alice'),
    ('bob@example.com','bob','$2a$10$ABC','Bob'),
    ('carol@example.com','carol','$2a$10$DEF','Carol');

INSERT INTO workout_sessions (user_id, workout_name, workout_date, completed_at, completion_count) VALUES
    (1, 'Morning Routine', '2025-10-20 08:00:00', '2025-10-20 08:00:00', 1),
    (2, 'Leg Day', '2025-10-21 18:00:00', '2025-10-21 18:00:00', 1),
    (3, 'Cardio Blast', '2025-10-22 07:00:00', '2025-10-22 07:00:00', 1);

INSERT INTO workouts (workout_session_id, exercise_name, exercise_type, category, sets, reps, weight) VALUES
    (1, 'Push-ups', 'bodyweight', 'bodyweight', 3, 15, NULL),
    (1, 'Pull-ups', 'bodyweight', 'bodyweight', 3, 10, NULL),
    (2, 'Squat', 'strength', 'strength', 4, 12, 135.00),
    (2, 'Leg Press', 'strength', 'strength', 3, 15, 200.00),
    (3, 'Running', 'cardio', 'cardio', NULL, NULL, NULL);

UPDATE workouts SET duration = 30, distance = 3.5 WHERE exercise_name = 'Running';

SELECT 
    u.email,
    ws.workout_name,
    ws.workout_date,
    ws.completed_at,
    ws.completion_count,
    w.exercise_name,
    w.sets,
    w.reps,
    w.weight,
    w.duration,
    w.distance
FROM `user` u
JOIN workout_sessions ws ON u.id = ws.user_id
JOIN workouts w ON ws.id = w.workout_session_id
ORDER BY ws.completed_at DESC, w.id;
