USE cis440fall2025team5;

-- Drop all existing tables in correct order
DROP TABLE IF EXISTS workout_completions;
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

-- NEW: Workout completions (permanent history, never deleted)
CREATE TABLE workout_completions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    workout_session_id INT NULL,
    workout_name VARCHAR(255) NOT NULL,
    completed_at DATETIME NOT NULL,
    exercises_data JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id) ON DELETE SET NULL,
    INDEX idx_user_completed (user_id, completed_at)
);

-- Individual exercise history (every time an exercise is performed)
CREATE TABLE exercise_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    workout_session_id INT DEFAULT NULL,
    exercise_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    sets INT DEFAULT NULL,
    reps INT DEFAULT NULL,
    weight DECIMAL(8,2) DEFAULT NULL,
    duration INT DEFAULT NULL,
    distance DECIMAL(6,2) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    completed_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES `user`(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id) ON DELETE SET NULL,
    INDEX idx_user_exercise (user_id, exercise_name),
    INDEX idx_completed_at (completed_at),
    INDEX idx_category (category)
);

-- Personal records for each exercise (tracks best performance per exercise)
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

-- Achievement definitions (predefined achievements)
CREATE TABLE achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    icon VARCHAR(10) NOT NULL,
    category ENUM('workout', 'streak', 'exercise', 'weight', 'distance', 'time', 'social', 'milestone') NOT NULL,
    requirement_type ENUM('count', 'streak', 'total', 'single', 'variety') NOT NULL,
    requirement_value INT NOT NULL,
    rarity ENUM('common', 'rare', 'epic', 'legendary') NOT NULL DEFAULT 'common',
    points INT NOT NULL DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User achievements (unlocked achievements)
CREATE TABLE user_achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    achievement_id INT NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    progress INT DEFAULT 0,
    is_displayed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_achievement (user_id, achievement_id),
    INDEX idx_user (user_id),
    INDEX idx_unlocked (unlocked_at)
);

-- Insert predefined achievements
INSERT INTO achievements (name, description, icon, category, requirement_type, requirement_value, rarity, points) VALUES
-- Workout Milestones
('First Steps', 'Complete your first workout', '🎯', 'workout', 'count', 1, 'common', 10),
('Getting Started', 'Complete 5 workouts', '💪', 'workout', 'count', 5, 'common', 25),
('Consistency', 'Complete 10 workouts', '🔥', 'workout', 'count', 10, 'common', 50),
('Dedicated', 'Complete 25 workouts', '⭐', 'workout', 'count', 25, 'rare', 100),
('Warrior', 'Complete 50 workouts', '🏆', 'workout', 'count', 50, 'rare', 250),
('Champion', 'Complete 100 workouts', '👑', 'workout', 'count', 100, 'epic', 500),
('Legend', 'Complete 250 workouts', '💎', 'workout', 'count', 250, 'legendary', 1000),

-- Streak Achievements
('On Fire', 'Maintain a 3-day streak', '🔥', 'streak', 'streak', 3, 'common', 30),
('Unstoppable', 'Maintain a 7-day streak', '⚡', 'streak', 'streak', 7, 'rare', 100),
('Iron Will', 'Maintain a 14-day streak', '🛡️', 'streak', 'streak', 14, 'rare', 200),
('Legendary Streak', 'Maintain a 30-day streak', '🌟', 'streak', 'streak', 30, 'epic', 500),
('Year Warrior', 'Maintain a 365-day streak', '🎖️', 'streak', 'streak', 365, 'legendary', 2000),

-- Exercise Variety
('Explorer', 'Try 5 different exercises', '🗺️', 'exercise', 'variety', 5, 'common', 20),
('Versatile', 'Try 10 different exercises', '🎨', 'exercise', 'variety', 10, 'common', 50),
('Well-Rounded', 'Try 20 different exercises', '🌈', 'exercise', 'variety', 20, 'rare', 100),

-- Strength Milestones
('Lightweight', 'Lift a total of 1,000 lbs', '🏋️', 'weight', 'total', 1000, 'common', 50),
('Heavyweight', 'Lift a total of 10,000 lbs', '💪', 'weight', 'total', 10000, 'rare', 200),
('Powerhouse', 'Lift a total of 50,000 lbs', '⚡', 'weight', 'total', 50000, 'epic', 500),

-- Cardio Milestones
('First Mile', 'Run/walk 1 mile total', '👟', 'distance', 'total', 1, 'common', 20),
('5K Runner', 'Run/walk 3.1 miles total', '🏃', 'distance', 'total', 3, 'common', 50),
('Marathon Prep', 'Run/walk 26 miles total', '🎽', 'distance', 'total', 26, 'rare', 200),
('Ultra Runner', 'Run/walk 100 miles total', '🌟', 'distance', 'total', 100, 'epic', 500),

-- Time Milestones
('Hour Warrior', 'Exercise for 60 total minutes', '⏱️', 'time', 'total', 60, 'common', 30),
('Time Master', 'Exercise for 10 total hours', '⏰', 'time', 'total', 600, 'rare', 150),
('Endurance Beast', 'Exercise for 50 total hours', '🦁', 'time', 'total', 3000, 'epic', 500),

-- Social Achievements (for community feature)
('Social Butterfly', 'Follow 5 users', '🦋', 'social', 'count', 5, 'common', 25),
('Influencer', 'Have 10 followers', '✨', 'social', 'count', 10, 'rare', 100),
('Community Leader', 'Have 50 followers', '👥', 'social', 'count', 50, 'epic', 300);

-- Show all tables
SHOW TABLES;
