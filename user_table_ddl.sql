USE cis440fall2025team5;

-- Drop all existing tables in correct order (not updated)
DROP TABLE IF EXISTS `post_likes`;
DROP TABLE IF EXISTS `post_comments`;
DROP TABLE IF EXISTS `user_posts`;
DROP TABLE IF EXISTS `user_showcase_achievements`;
DROP TABLE IF EXISTS `user_achievements`;
DROP TABLE IF EXISTS `achievements`;
DROP TABLE IF EXISTS `workout_challenges`;
DROP TABLE IF EXISTS `workouts`;
DROP TABLE IF EXISTS `workout_completions`;
DROP TABLE IF EXISTS `exercise_history`;
DROP TABLE IF EXISTS `exercise_personal_records`;
DROP TABLE IF EXISTS `user_progress_stats`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `leaderboards`;
DROP TABLE IF EXISTS `user_follows`;
DROP TABLE IF EXISTS `user_profiles`;
DROP TABLE IF EXISTS `workout_sessions`;
DROP TABLE IF EXISTS `exercise_history_old`;
DROP TABLE IF EXISTS `users_logins`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `user`;

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

-- Workout completions (permanent history, never deleted)
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
    icon VARCHAR(50) NOT NULL,
    category ENUM('workout', 'streak', 'exercise', 'weight', 'distance', 'time', 'social', 'milestone') NOT NULL,
    requirement_type ENUM('count', 'streak', 'total', 'single', 'variety') NOT NULL,
    requirement_value INT NOT NULL,
    rarity ENUM('onetime', 'weekly', 'monthly') NOT NULL DEFAULT 'onetime',
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

-- Insert predefined achievements (using text codes for emojis)
INSERT INTO achievements (name, description, icon, category, requirement_type, requirement_value, rarity, points) VALUES
-- One-Time Workout Milestones
('First Steps', 'Complete your first workout', '[TARGET]', 'workout', 'count', 1, 'onetime', 10),
('Getting Started', 'Complete 5 workouts', '[MUSCLE]', 'workout', 'count', 5, 'onetime', 25),
('Consistency', 'Complete 10 workouts', '[FIRE]', 'workout', 'count', 10, 'onetime', 50),
('Dedicated', 'Complete 25 workouts', '[STAR]', 'workout', 'count', 25, 'onetime', 100),
('Warrior', 'Complete 50 workouts', '[TROPHY]', 'workout', 'count', 50, 'onetime', 250),
('Champion', 'Complete 100 workouts', '[CROWN]', 'workout', 'count', 100, 'onetime', 500),
('Legend', 'Complete 250 workouts', '[GEM]', 'workout', 'count', 250, 'onetime', 1000),

-- Streak Achievements
('On Fire', 'Maintain a 3-day streak', '[FIRE]', 'streak', 'streak', 3, 'onetime', 30),
('Unstoppable', 'Maintain a 7-day streak', '[BOLT]', 'streak', 'streak', 7, 'onetime', 100),
('Iron Will', 'Maintain a 14-day streak', '[SHIELD]', 'streak', 'streak', 14, 'onetime', 200),
('Legendary Streak', 'Maintain a 30-day streak', '[STARS]', 'streak', 'streak', 30, 'onetime', 500),

-- Exercise Variety
('Explorer', 'Try 5 different exercises', '[MAP]', 'exercise', 'variety', 5, 'onetime', 20),
('Versatile', 'Try 10 different exercises', '[PAINT]', 'exercise', 'variety', 10, 'onetime', 50),
('Well-Rounded', 'Try 20 different exercises', '[RAINBOW]', 'exercise', 'variety', 20, 'onetime', 100),

-- Strength Milestones
('Lightweight', 'Lift a total of 1,000 lbs', '[WEIGHT]', 'weight', 'total', 1000, 'onetime', 50),
('Heavyweight', 'Lift a total of 10,000 lbs', '[POWER]', 'weight', 'total', 10000, 'onetime', 200),
('Powerhouse', 'Lift a total of 50,000 lbs', '[FLASH]', 'weight', 'total', 50000, 'onetime', 500),

-- Cardio Milestones
('First Mile', 'Run/walk 1 mile total', '[SHOE]', 'distance', 'total', 1, 'onetime', 20),
('5K Runner', 'Run/walk 3 miles total', '[RUN]', 'distance', 'total', 3, 'onetime', 50),
('Marathon Prep', 'Run/walk 26 miles total', '[MEDAL]', 'distance', 'total', 26, 'onetime', 200),

-- Time Milestones
('Hour Warrior', 'Exercise for 60 total minutes', '[TIMER]', 'time', 'total', 60, 'onetime', 30),
('Time Master', 'Exercise for 10 total hours', '[CLOCK]', 'time', 'total', 600, 'onetime', 150),

-- Weekly Achievements (reset every week)
('Weekly Warrior', 'Complete 3 workouts this week', '[ZAP]', 'workout', 'count', 3, 'weekly', 30),
('Week Dominator', 'Complete 5 workouts this week', '[GLOW]', 'workout', 'count', 5, 'weekly', 50),
('Weekly Beast', 'Complete 7 workouts this week', '[LION]', 'workout', 'count', 7, 'weekly', 100),

-- Monthly Achievements (reset every month)
('Monthly Master', 'Complete 12 workouts this month', '[BADGE]', 'workout', 'count', 12, 'monthly', 100),
('Month Champion', 'Complete 20 workouts this month', '[DIAMOND]', 'workout', 'count', 20, 'monthly', 200),
('Monthly Legend', 'Complete 30 workouts this month', '[KING]', 'workout', 'count', 30, 'monthly', 300);

-- Show all tables
-- User profiles and settings
CREATE TABLE user_profiles (
    user_id INT PRIMARY KEY,
    profile_picture VARCHAR(255) DEFAULT NULL,
    cover_image VARCHAR(255) DEFAULT NULL,
    profile_color VARCHAR(7) DEFAULT '#2563eb',
    bio TEXT DEFAULT NULL,
    location VARCHAR(100) DEFAULT NULL,
    fitness_goal TEXT DEFAULT NULL,
    privacy_level ENUM('public', 'friends', 'private') DEFAULT 'public',
    show_workouts BOOLEAN DEFAULT TRUE,
    show_achievements BOOLEAN DEFAULT TRUE,
    show_stats BOOLEAN DEFAULT TRUE,
    show_progress BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- Followers/Following system
CREATE TABLE user_follows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    follower_id INT NOT NULL,
    following_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (follower_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE KEY unique_follow (follower_id, following_id),
    INDEX idx_follower (follower_id),
    INDEX idx_following (following_id)
);

-- Workout challenges
CREATE TABLE workout_challenges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    challenger_id INT NOT NULL,
    challenged_id INT NOT NULL,
    workout_session_id INT NOT NULL,
    message TEXT DEFAULT NULL,
    status ENUM('pending', 'accepted', 'declined', 'completed', 'expired') DEFAULT 'pending',
    challenger_completed BOOLEAN DEFAULT FALSE,
    challenged_completed BOOLEAN DEFAULT FALSE,
    challenger_time INT DEFAULT NULL,
    challenged_time INT DEFAULT NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (challenger_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (challenged_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
    INDEX idx_challenged (challenged_id, status),
    INDEX idx_challenger (challenger_id, status)
);

-- Activity feed (posts, updates, achievements)
CREATE TABLE user_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    post_type ENUM('workout', 'achievement', 'milestone', 'status') NOT NULL,
    content TEXT NOT NULL,
    workout_session_id INT DEFAULT NULL,
    achievement_id INT DEFAULT NULL,
    likes_count INT DEFAULT 0,
    comments_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE SET NULL,
    INDEX idx_user_created (user_id, created_at),
    INDEX idx_created (created_at)
);

-- Post likes
CREATE TABLE post_likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES user_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE KEY unique_like (post_id, user_id),
    INDEX idx_post (post_id)
);

-- Post comments
CREATE TABLE post_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES user_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    INDEX idx_post_created (post_id, created_at)
);

-- User displayed achievements (customizable showcase)
CREATE TABLE user_showcase_achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    achievement_id INT NOT NULL,
    display_order INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES user_achievements(achievement_id) ON DELETE CASCADE,
    UNIQUE KEY unique_showcase (user_id, achievement_id),
    INDEX idx_user_order (user_id, display_order)
);

-- Notifications
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('follow', 'challenge', 'like', 'comment', 'achievement', 'milestone') NOT NULL,
    from_user_id INT DEFAULT NULL,
    reference_id INT DEFAULT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user_id) REFERENCES user(id) ON DELETE CASCADE,
    INDEX idx_user_read (user_id, is_read, created_at)
);

-- Leaderboards (weekly/monthly)
CREATE TABLE leaderboards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    period_type ENUM('weekly', 'monthly', 'all_time') NOT NULL,
    period_start DATE NOT NULL,
    workouts_count INT DEFAULT 0,
    total_exercises INT DEFAULT 0,
    total_points INT DEFAULT 0,
    total_weight DECIMAL(12,2) DEFAULT 0,
    total_distance DECIMAL(10,2) DEFAULT 0,
    total_time INT DEFAULT 0,
    rank_position INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_period (user_id, period_type, period_start),
    INDEX idx_period_rank (period_type, period_start, rank_position)
);

SHOW TABLES;

