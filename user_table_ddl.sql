USE cis440fall2025team5;

-- Drop all existing tables in correct order
DROP TABLE IF EXISTS exercise_personal_records;
DROP TABLE IF EXISTS exercise_history;
DROP TABLE IF EXISTS user_progress_stats;
DROP TABLE IF EXISTS workouts;
DROP TABLE IF EXISTS workout_sessions;
DROP TABLE IF EXISTS exercise_history_old;
DROP TABLE IF EXISTS users_logins;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS user;

-- User table
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

-- Workout sessions (templates/routines)
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

-- Exercises in workout templates
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

-- NEW: Individual exercise history (every time an exercise is performed)
CREATE TABLE exercise_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    workout_session_id INT DEFAULT NULL,
    exercise_name VARCHAR(255) NOT NULL,
    exercise_type VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL,
    sets INT DEFAULT NULL,
    reps INT DEFAULT NULL,
    weight DECIMAL(8,2) DEFAULT NULL,
    duration INT DEFAULT NULL,
    distance DECIMAL(6,2) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    performed_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id) ON DELETE SET NULL,
    INDEX idx_user_exercise (user_id, exercise_name),
    INDEX idx_performed_at (performed_at),
    INDEX idx_category (category)
);

-- NEW: Personal records for each exercise (tracks best performance per exercise)
CREATE TABLE exercise_personal_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    exercise_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    times_performed INT DEFAULT 0,
    last_performed DATETIME DEFAULT NULL,
    max_weight DECIMAL(8,2) DEFAULT NULL,
    max_weight_date DATETIME DEFAULT NULL,
    max_reps INT DEFAULT NULL,
    max_reps_date DATETIME DEFAULT NULL,
    max_sets INT DEFAULT NULL,
    max_sets_date DATETIME DEFAULT NULL,
    longest_duration INT DEFAULT NULL,
    longest_duration_date DATETIME DEFAULT NULL,
    longest_distance DECIMAL(6,2) DEFAULT NULL,
    longest_distance_date DATETIME DEFAULT NULL,
    total_weight_lifted DECIMAL(12,2) DEFAULT 0,
    total_reps INT DEFAULT 0,
    total_sets INT DEFAULT 0,
    total_duration INT DEFAULT 0,
    total_distance DECIMAL(10,2) DEFAULT 0,
    avg_weight DECIMAL(8,2) DEFAULT NULL,
    avg_reps DECIMAL(6,2) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_exercise (user_id, exercise_name),
    FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_exercise (exercise_name),
    INDEX idx_category (category)
);

-- Overall user progress statistics
CREATE TABLE user_progress_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    total_workouts INT DEFAULT 0,
    total_exercises INT DEFAULT 0,
    unique_exercises INT DEFAULT 0,
    current_streak INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    workouts_this_week INT DEFAULT 0,
    workouts_this_month INT DEFAULT 0,
    workouts_this_year INT DEFAULT 0,
    exercises_this_week INT DEFAULT 0,
    exercises_this_month INT DEFAULT 0,
    total_weight_lifted DECIMAL(12,2) DEFAULT 0,
    total_duration_minutes DECIMAL(12,2) DEFAULT 0,
    total_distance_miles DECIMAL(12,2) DEFAULT 0,
    total_reps INT DEFAULT 0,
    total_sets INT DEFAULT 0,
    strength_exercises INT DEFAULT 0,
    cardio_exercises INT DEFAULT 0,
    flexibility_exercises INT DEFAULT 0,
    bodyweight_exercises INT DEFAULT 0,
    favorite_exercise VARCHAR(255) DEFAULT NULL,
    favorite_exercise_count INT DEFAULT 0,
    most_active_day VARCHAR(20) DEFAULT NULL,
    most_active_time VARCHAR(20) DEFAULT NULL,
    avg_workout_duration DECIMAL(6,2) DEFAULT NULL,
    first_workout_date DATETIME DEFAULT NULL,
    last_workout_date DATETIME DEFAULT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
);

-- Show all tables
SHOW TABLES;
