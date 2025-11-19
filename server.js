require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const expressLayouts = require('express-ejs-layouts');

const app = express();

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// Use express-ejs-layouts for template inheritance
app.use(expressLayouts);
app.set('layout', 'base'); // Default layout file is base.ejs

const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static('public'));

//////////////////////////////////////
// CREATE CONNECTION POOL (ONCE)
//////////////////////////////////////
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection at startup
(async () => {
    try {
        const [rows] = await pool.query('SELECT DATABASE() AS current_db');
        console.log('🔍 Connected to DB:', rows[0].current_db);
    } catch (err) {
        console.error('❌ Failed to connect to DB at startup:', err.message);
    }
})();

//////////////////////////////////////
// HELPER FUNCTIONS FOR TRACKING
//////////////////////////////////////

// Calculate and update user progress stats
async function updateUserProgressStats(userId) {
    try {
        // Check if stats exist
        const [existing] = await pool.execute(
            'SELECT * FROM user_progress_stats WHERE user_id = ?',
            [userId]
        );

        // Get total workouts completed from workout_completions
        const [workoutStats] = await pool.execute(
            `SELECT 
                COUNT(*) as total_workouts,
                MIN(completed_at) as first_workout,
                MAX(completed_at) as last_workout
            FROM workout_completions 
            WHERE user_id = ?`,
            [userId]
        );

        // Get total exercises
        const [exerciseStats] = await pool.execute(
            `SELECT 
                COUNT(*) as total_exercises,
                COUNT(DISTINCT exercise_name) as unique_exercises
            FROM exercise_history 
            WHERE user_id = ?`,
            [userId]
        );

        // Get category breakdown
        const [categoryStats] = await pool.execute(
            `SELECT 
                category,
                COUNT(*) as count
            FROM exercise_history
            WHERE user_id = ?
            GROUP BY category`,
            [userId]
        );

        const categoryMap = {};
        categoryStats.forEach(row => {
            categoryMap[row.category] = row.count;
        });

        // Get totals
        const [totals] = await pool.execute(
            `SELECT 
                SUM(COALESCE(weight, 0) * COALESCE(sets, 0) * COALESCE(reps, 0)) as total_weight,
                SUM(COALESCE(duration, 0)) as total_duration,
                SUM(COALESCE(distance, 0)) as total_distance,
                SUM(COALESCE(reps, 0)) as total_reps,
                SUM(COALESCE(sets, 0)) as total_sets
            FROM exercise_history
            WHERE user_id = ?`,
            [userId]
        );

        // Get favorite exercise
        const [favorite] = await pool.execute(
            `SELECT exercise_name, COUNT(*) as count
            FROM exercise_history
            WHERE user_id = ?
            GROUP BY exercise_name
            ORDER BY count DESC
            LIMIT 1`,
            [userId]
        );

        // Calculate streak from workout_completions
        const [completedDates] = await pool.execute(
            `SELECT DISTINCT DATE(completed_at) as workout_date
            FROM workout_completions
            WHERE user_id = ? 
            ORDER BY workout_date DESC`,
            [userId]
        );

        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 1;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (completedDates.length > 0) {
            const lastWorkout = new Date(completedDates[0].workout_date);
            lastWorkout.setHours(0, 0, 0, 0);
            
            // Check if last workout was today or yesterday
            const daysSinceLastWorkout = Math.floor((today - lastWorkout) / (1000 * 60 * 60 * 24));
            
            if (daysSinceLastWorkout <= 1) {
                // Start counting streak
                currentStreak = 1;
                
                for (let i = 1; i < completedDates.length; i++) {
                    const currentDate = new Date(completedDates[i].workout_date);
                    const previousDate = new Date(completedDates[i - 1].workout_date);
                    currentDate.setHours(0, 0, 0, 0);
                    previousDate.setHours(0, 0, 0, 0);
                    
                    const dayDiff = Math.floor((previousDate - currentDate) / (1000 * 60 * 60 * 24));
                    
                    if (dayDiff === 1) {
                        currentStreak++;
                    } else {
                        break;
                    }
                }
            }
            
            // Calculate longest streak
            tempStreak = 1;
            longestStreak = 1;
            
            for (let i = 1; i < completedDates.length; i++) {
                const currentDate = new Date(completedDates[i].workout_date);
                const previousDate = new Date(completedDates[i - 1].workout_date);
                currentDate.setHours(0, 0, 0, 0);
                previousDate.setHours(0, 0, 0, 0);
                
                const dayDiff = Math.floor((previousDate - currentDate) / (1000 * 60 * 60 * 24));
                
                if (dayDiff === 1) {
                    tempStreak++;
                    longestStreak = Math.max(longestStreak, tempStreak);
                } else {
                    tempStreak = 1;
                }
            }
        }

        // This week and month counts
        const [weekStats] = await pool.execute(
            `SELECT 
                COUNT(*) as this_week
            FROM workout_completions
            WHERE user_id = ? 
            AND completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
            [userId]
        );

        const [monthStats] = await pool.execute(
            `SELECT 
                COUNT(*) as this_month
            FROM workout_completions
            WHERE user_id = ? 
            AND completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
            [userId]
        );

        const statsData = {
            total_workouts: workoutStats[0].total_workouts || 0,
            total_exercises: exerciseStats[0].total_exercises || 0,
            unique_exercises: exerciseStats[0].unique_exercises || 0,
            current_streak: currentStreak,
            longest_streak: longestStreak,
            workouts_this_week: weekStats[0].this_week || 0,
            workouts_this_month: monthStats[0].this_month || 0,
            total_weight_lifted: totals[0].total_weight || 0,
            total_duration_minutes: totals[0].total_duration || 0,
            total_distance_miles: totals[0].total_distance || 0,
            total_reps: totals[0].total_reps || 0,
            total_sets: totals[0].total_sets || 0,
            strength_exercises: categoryMap.strength || 0,
            cardio_exercises: categoryMap.cardio || 0,
            flexibility_exercises: categoryMap.flexibility || 0,
            bodyweight_exercises: categoryMap.bodyweight || 0,
            favorite_exercise: favorite.length > 0 ? favorite[0].exercise_name : null,
            favorite_exercise_count: favorite.length > 0 ? favorite[0].count : 0,
            first_workout_date: workoutStats[0].first_workout,
            last_workout_date: workoutStats[0].last_workout
        };

        if (existing.length === 0) {
            // Insert new stats
            await pool.execute(
                `INSERT INTO user_progress_stats 
                (user_id, total_workouts, total_exercises, unique_exercises, current_streak, longest_streak,
                 workouts_this_week, workouts_this_month, total_weight_lifted, total_duration_minutes,
                 total_distance_miles, total_reps, total_sets, strength_exercises, cardio_exercises,
                 flexibility_exercises, bodyweight_exercises, favorite_exercise, favorite_exercise_count,
                 first_workout_date, last_workout_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, statsData.total_workouts, statsData.total_exercises, statsData.unique_exercises,
                    statsData.current_streak, statsData.longest_streak, statsData.workouts_this_week,
                    statsData.workouts_this_month, statsData.total_weight_lifted, statsData.total_duration_minutes,
                    statsData.total_distance_miles, statsData.total_reps, statsData.total_sets,
                    statsData.strength_exercises, statsData.cardio_exercises, statsData.flexibility_exercises,
                    statsData.bodyweight_exercises, statsData.favorite_exercise, statsData.favorite_exercise_count,
                    statsData.first_workout_date, statsData.last_workout_date
                ]
            );
        } else {
            // Update existing stats
            await pool.execute(
                `UPDATE user_progress_stats SET
                    total_workouts = ?, total_exercises = ?, unique_exercises = ?,
                    current_streak = ?, longest_streak = ?, workouts_this_week = ?,
                    workouts_this_month = ?, total_weight_lifted = ?, total_duration_minutes = ?,
                    total_distance_miles = ?, total_reps = ?, total_sets = ?,
                    strength_exercises = ?, cardio_exercises = ?, flexibility_exercises = ?,
                    bodyweight_exercises = ?, favorite_exercise = ?, favorite_exercise_count = ?,
                    first_workout_date = ?, last_workout_date = ?
                WHERE user_id = ?`,
                [
                    statsData.total_workouts, statsData.total_exercises, statsData.unique_exercises,
                    statsData.current_streak, statsData.longest_streak, statsData.workouts_this_week,
                    statsData.workouts_this_month, statsData.total_weight_lifted, statsData.total_duration_minutes,
                    statsData.total_distance_miles, statsData.total_reps, statsData.total_sets,
                    statsData.strength_exercises, statsData.cardio_exercises, statsData.flexibility_exercises,
                    statsData.bodyweight_exercises, statsData.favorite_exercise, statsData.favorite_exercise_count,
                    statsData.first_workout_date, statsData.last_workout_date, userId
                ]
            );
        }
         await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
        console.error('Error updating user progress stats:', error);
    }
}
async function checkAndUnlockAchievements(userId) {
    try {
        const [stats] = await pool.execute(
            'SELECT * FROM user_progress_stats WHERE user_id = ?',
            [userId]
        );

        if (stats.length === 0) return [];

        const userStats = stats[0];
        const newlyUnlocked = [];

        const [lockedAchievements] = await pool.execute(
            `SELECT a.* FROM achievements a
            LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
            WHERE ua.id IS NULL`,
            [userId]
        );

        for (const achievement of lockedAchievements) {
            let shouldUnlock = false;

            switch(achievement.requirement_type) {
                case 'count':
                    if (achievement.category === 'workout' && userStats.total_workouts >= achievement.requirement_value) {
                        shouldUnlock = true;
                    } else if (achievement.category === 'exercise' && userStats.total_exercises >= achievement.requirement_value) {
                        shouldUnlock = true;
                    }
                    break;
                case 'streak':
                    if (userStats.current_streak >= achievement.requirement_value) {
                        shouldUnlock = true;
                    }
                    break;
                case 'total':
                    if (achievement.category === 'weight' && userStats.total_weight_lifted >= achievement.requirement_value) {
                        shouldUnlock = true;
                    } else if (achievement.category === 'distance' && userStats.total_distance_miles >= achievement.requirement_value) {
                        shouldUnlock = true;
                    } else if (achievement.category === 'time' && userStats.total_duration_minutes >= achievement.requirement_value) {
                        shouldUnlock = true;
                    }
                    break;
                case 'variety':
                    if (userStats.unique_exercises >= achievement.requirement_value) {
                        shouldUnlock = true;
                    }
                    break;
            }

            if (shouldUnlock) {
                await pool.execute(
                    'INSERT INTO user_achievements (user_id, achievement_id, progress) VALUES (?, ?, ?)',
                    [userId, achievement.id, achievement.requirement_value]
                );

                // CREATE FEED POST FOR ACHIEVEMENT
                await createFeedPost(
                    userId,
                    'achievement',
                    `Unlocked ${achievement.name}!`,
                    achievement.id,
                    null
                );

                newlyUnlocked.push(achievement);
            }
        }

        return newlyUnlocked;
    } catch (error) {
        console.error('Error checking achievements:', error);
        return [];
    }
}

// Helper function to create feed posts
async function createFeedPost(userId, postType, content, achievementId = null, workoutId = null) {
    try {
        await pool.execute(
            `INSERT INTO user_posts (user_id, post_type, content, achievement_id, workout_id) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, postType, content, achievementId, workoutId]
        );
    } catch (error) {
        console.error('Error creating feed post:', error);
    }
}


//////////////////////////////////////
//ROUTES TO SERVE HTML FILES
//////////////////////////////////////
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/logon.html');
});

app.get('/dashboard', (req, res) => {
    res.render('dashboard', { title: 'Dashboard - FitTracker' });
});

app.get('/workout', (req, res) => {
    res.render('workout', { title: 'Workout Tracker - FitTracker' });
});

app.get('/progress', (req, res) => {
    res.render('progress', { title: 'Progress - FitTracker' });
});

app.get('/community', (req, res) => {
    res.render('community', { title: 'Community - FitTracker' });
});

app.get('/achievements', (req, res) => {
    res.render('achievements', { title: 'Achievements - FitTracker' });
});

app.get('/profile', (req, res) => {
    res.render('profile', { title: 'Profile - FitTracker' });
});

/////////////////////////////////////////////////
//AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////
async function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid token.' });
        }

        try {
            const [rows] = await pool.execute(
                'SELECT email FROM user WHERE email = ?',
                [decoded.email]
            );

            if (rows.length === 0) {
                return res.status(403).json({ message: 'Account not found or deactivated.' });
            }

            req.user = decoded;
            next();
        } catch (dbError) {
            console.error(dbError);
            res.status(500).json({ message: 'Database error during authentication.' });
        }
    });
}

//////////////////////////////////////
//ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////

// Route: Create Account
app.post('/api/create-account', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email and password are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO user (email, password, display_name) VALUES (?, ?, ?)',
            [email, hashedPassword, name]
        );
        res.status(201).json({ message: 'Account created successfully!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ message: 'An account with this email already exists.' });
        } else {
            console.error(error);
            res.status(500).json({ message: 'Error creating account.' });
        }
    }
});

// Route: Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const [rows] = await pool.execute(
            'SELECT * FROM user WHERE email = ?',
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const user = rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        res.status(200).json({ 
            token,
            name: user.display_name || user.username || 'User' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error logging in.' });
    }
});

// Route: Get All Email Addresses
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT email FROM user');
        const emailList = rows.map((row) => row.email);
        res.status(200).json({ emails: emailList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving email addresses.' });
    }
});

//////////////////////////////////////
// WORKOUT API ROUTES
//////////////////////////////////////

// Save a new workout with multiple exercises
app.post('/api/workouts', authenticateToken, async (req, res) => {
    const { name, exercises, date } = req.body;
    const userEmail = req.user.email;

    if (!name || !exercises || exercises.length === 0) {
        return res.status(400).json({ message: 'Workout name and exercises are required.' });
    }

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        const [sessionResult] = await pool.execute(
            'INSERT INTO workout_sessions (user_id, workout_name, workout_date) VALUES (?, ?, ?)',
            [userId, name, date || new Date()]
        );

        const sessionId = sessionResult.insertId;

        for (const exercise of exercises) {
            await pool.execute(
                `INSERT INTO workouts 
                (workout_session_id, exercise_name, exercise_type, category, sets, reps, weight, duration, distance) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    sessionId,
                    exercise.name,
                    exercise.type,
                    exercise.category,
                    exercise.sets || null,
                    exercise.reps || null,
                    exercise.weight || null,
                    exercise.duration || null,
                    exercise.distance || null
                ]
            );
        }

        res.status(201).json({ message: 'Workout saved successfully!', workoutId: sessionId });
    } catch (error) {
        console.error('Error saving workout:', error);
        res.status(500).json({ message: 'Error saving workout.' });
    }
});

// Get all workouts for the authenticated user
app.get('/api/workouts', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        const [sessions] = await pool.execute(
            `SELECT 
                ws.id,
                ws.workout_name as name,
                ws.workout_date as date,
                ws.completed_at,
                ws.completion_count,
                ws.created_at,
                w.exercise_name,
                w.exercise_type,
                w.category,
                w.sets,
                w.reps,
                w.weight,
                w.duration,
                w.distance,
                w.completed
            FROM workout_sessions ws
            LEFT JOIN workouts w ON ws.id = w.workout_session_id
            WHERE ws.user_id = ?
            ORDER BY 
                COALESCE(ws.completed_at, ws.created_at) DESC,
                w.id`,
            [userId]
        );

        const workoutMap = {};
        sessions.forEach(row => {
            if (!workoutMap[row.id]) {
                workoutMap[row.id] = {
                    id: row.id,
                    name: row.name,
                    date: row.date,
                    completedAt: row.completed_at,
                    completionCount: row.completion_count,
                    createdAt: row.created_at,
                    exercises: []
                };
            }
            if (row.exercise_name) {
                workoutMap[row.id].exercises.push({
                    name: row.exercise_name,
                    type: row.exercise_type,
                    category: row.category,
                    sets: row.sets,
                    reps: row.reps,
                    weight: row.weight,
                    duration: row.duration,
                    distance: row.distance,
                    completed: row.completed
                });
            }
        });

        const workouts = Object.values(workoutMap);
        res.status(200).json(workouts);
    } catch (error) {
        console.error('Error loading workouts:', error);
        res.status(500).json({ message: 'Error loading workouts.' });
    }
});

// Get workout completions for calendar and stats
app.get('/api/workouts/completions', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        const [completions] = await pool.execute(
            `SELECT id, workout_name as name, completed_at as completedAt, exercises_data as exercises
            FROM workout_completions 
            WHERE user_id = ? 
            ORDER BY completed_at DESC`,
            [userId]
        );

        // Parse exercises JSON
        completions.forEach(c => {
            c.exercises = JSON.parse(c.exercises);
        });

        res.json(completions);
    } catch (error) {
        console.error('Error fetching completions:', error);
        res.status(500).json({ message: 'Error fetching completions.' });
    }
});

// Mark workout as complete
app.post('/api/workouts/:id/complete', authenticateToken, async (req, res) => {
    const workoutId = req.params.id;
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        // Get workout details with exercises
        const [sessionRows] = await pool.execute(
            'SELECT workout_name, workout_date FROM workout_sessions WHERE id = ? AND user_id = ?',
            [workoutId, userId]
        );

        if (sessionRows.length === 0) {
            return res.status(404).json({ message: 'Workout not found.' });
        }

        const workout = sessionRows[0];

        // Get all exercises for this workout
        const [exerciseRows] = await pool.execute(
            'SELECT * FROM workouts WHERE workout_session_id = ?',
            [workoutId]
        );

        const completedAt = new Date();

        // Convert exercises to JSON format
        const exercisesData = exerciseRows.map(ex => ({
            name: ex.exercise_name,
            type: ex.exercise_type,
            category: ex.category,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight,
            duration: ex.duration,
            distance: ex.distance
        }));

        // Insert into workout_completions table (permanent record)
        await pool.execute(
            'INSERT INTO workout_completions (user_id, workout_session_id, workout_name, completed_at, exercises_data) VALUES (?, ?, ?, ?, ?)',
            [userId, workoutId, workout.workout_name, completedAt, JSON.stringify(exercisesData)]
        );

        // Update the workout_sessions with latest completion
        await pool.execute(
            'UPDATE workout_sessions SET completed_at = ?, completion_count = completion_count + 1 WHERE id = ?',
            [completedAt, workoutId]
        );

        // Record in exercise_history
        for (const exercise of exercisesData) {
            await pool.execute(
                `INSERT INTO exercise_history 
                (user_id, workout_session_id, exercise_name, category, sets, reps, weight, duration, distance, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    workoutId,
                    exercise.name,
                    exercise.category,
                    exercise.sets || null,
                    exercise.reps || null,
                    exercise.weight || null,
                    exercise.duration || null,
                    exercise.distance || null,
                    completedAt
                ]
            );

            // Update personal records
            await pool.execute(
                `INSERT INTO exercise_personal_records 
                (user_id, exercise_name, category, max_weight, max_reps, max_sets, longest_duration, longest_distance, times_performed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                ON DUPLICATE KEY UPDATE
                    max_weight = GREATEST(COALESCE(max_weight, 0), COALESCE(?, 0)),
                    max_reps = GREATEST(COALESCE(max_reps, 0), COALESCE(?, 0)),
                    max_sets = GREATEST(COALESCE(max_sets, 0), COALESCE(?, 0)),
                    longest_duration = GREATEST(COALESCE(longest_duration, 0), COALESCE(?, 0)),
                    longest_distance = GREATEST(COALESCE(longest_distance, 0), COALESCE(?, 0)),
                    times_performed = times_performed + 1`,
                [
                    userId, exercise.name, exercise.category,
                    exercise.weight || null, exercise.reps || null, exercise.sets || null,
                    exercise.duration || null, exercise.distance || null,
                    exercise.weight || null, exercise.reps || null, exercise.sets || null,
                    exercise.duration || null, exercise.distance || null
                ]
            );
        }

        // Update user progress stats
        await updateUserProgressStats(userId);

        // Check and unlock achievements
        const newAchievements = await checkAndUnlockAchievements(userId);

        // Get workout name for feed post
        const [workoutInfo] = await pool.execute(
            'SELECT workout_name FROM workout_sessions WHERE id = ?',
            [workoutId]
        );
        
        // CREATE FEED POST FOR WORKOUT COMPLETION
        await createFeedPost(
            userId,
            'workout',
            `Completed ${workoutInfo[0].workout_name}`,
            null,
            workoutId
        );


        // Send response with new achievements if any
        if (newAchievements.length > 0) {
            res.status(200).json({ 
                message: 'Workout completed!',
                newAchievements: newAchievements
            });
        } else {
            res.status(200).json({ message: 'Workout completed!' });
        }

    } catch (error) {
        console.error('Error completing workout:', error);
        res.status(500).json({ message: 'Error completing workout.' });
    }
});

// Delete a workout
app.delete('/api/workouts/:id', authenticateToken, async (req, res) => {
    const workoutId = req.params.id;
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        // Delete the exercises from workouts table
        await pool.execute(
            'DELETE FROM workouts WHERE workout_session_id = ?',
            [workoutId]
        );
        
        // Delete the workout session (completions are preserved via SET NULL)
        const [result] = await pool.execute(
            'DELETE FROM workout_sessions WHERE id = ? AND user_id = ?',
            [workoutId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Workout not found.' });
        }

        res.status(200).json({ message: 'Workout deleted successfully!' });
    } catch (error) {
        console.error('Error deleting workout:', error);
        res.status(500).json({ message: 'Error deleting workout.' });
    }
});

// Get user progress stats
app.get('/api/progress/stats', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;

    try {
        // Add no-cache headers
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        const [stats] = await pool.execute(
            'SELECT * FROM user_progress_stats WHERE user_id = ?',
            [userId]
        );

        if (stats.length === 0) {
            return res.status(200).json({
                total_workouts: 0,
                total_exercises: 0,
                current_streak: 0
            });
        }

        res.status(200).json(stats[0]);
    } catch (error) {
        console.error('Error loading progress stats:', error);
        res.status(500).json({ message: 'Error loading progress stats.' });
    }
});

// Get personal records
app.get('/api/progress/records', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        const [records] = await pool.execute(
            'SELECT * FROM exercise_personal_records WHERE user_id = ? ORDER BY times_performed DESC',
            [userId]
        );

        res.status(200).json(records);
    } catch (error) {
        console.error('Error loading personal records:', error);
        res.status(500).json({ message: 'Error loading personal records.' });
    }
});



// Get all achievements with user progress
app.get('/api/achievements', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        const [achievements] = await pool.execute(
            `SELECT 
                a.id, a.name, a.description, a.icon, a.category,
                a.requirement_type, a.requirement_value, a.rarity, a.points,
                ua.unlocked_at, ua.progress, ua.is_displayed,
                CASE WHEN ua.id IS NOT NULL THEN 1 ELSE 0 END as is_unlocked
            FROM achievements a
            LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
            ORDER BY 
                CASE a.rarity
                    WHEN 'legendary' THEN 4
                    WHEN 'epic' THEN 3
                    WHEN 'rare' THEN 2
                    ELSE 1
                END DESC,
                a.requirement_value ASC`,
            [userId]
        );

        const [stats] = await pool.execute(
            'SELECT * FROM user_progress_stats WHERE user_id = ?',
            [userId]
        );

        const userStats = stats[0] || {};

        achievements.forEach(achievement => {
            if (!achievement.is_unlocked) {
                let currentProgress = 0;
                
                switch(achievement.requirement_type) {
                    case 'count':
                        if (achievement.category === 'workout') {
                            currentProgress = userStats.total_workouts || 0;
                        } else if (achievement.category === 'exercise') {
                            currentProgress = userStats.total_exercises || 0;
                        }
                        break;
                    case 'streak':
                        currentProgress = userStats.current_streak || 0;
                        break;
                    case 'total':
                        if (achievement.category === 'weight') {
                            currentProgress = Math.floor(userStats.total_weight_lifted || 0);
                        } else if (achievement.category === 'distance') {
                            currentProgress = Math.floor(userStats.total_distance_miles || 0);
                        } else if (achievement.category === 'time') {
                            currentProgress = Math.floor(userStats.total_duration_minutes || 0);
                        }
                        break;
                    case 'variety':
                        currentProgress = userStats.unique_exercises || 0;
                        break;
                }
                
                achievement.progress = currentProgress;
                achievement.progress_percentage = Math.min(100, Math.floor((currentProgress / achievement.requirement_value) * 100));
            } else {
                achievement.progress = achievement.requirement_value;
                achievement.progress_percentage = 100;
            }
        });

        res.json(achievements);
    } catch (error) {
        console.error('Error loading achievements:', error);
        res.status(500).json({ message: 'Error loading achievements.' });
    }
});

//////////////////////////////////////
// COMMUNITY API ROUTES
//////////////////////////////////////
app.get('/api/community/profile/:userId', authenticateToken, async (req, res) => {
    const targetUserId = parseInt(req.params.userId);
    const currentUserEmail = req.user.email;

    try {
        // Get current user ID
        const [currentUserRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [currentUserEmail]
        );
        const currentUserId = currentUserRows[0].id;

        // Get target user basic info and privacy settings
        const [userRows] = await pool.execute(
            `SELECT u.id, u.display_name AS name, u.email, u.created_at AS joined,
                    up.bio, up.location, up.profile_picture, up.profile_color,
                    up.show_workouts, up.show_achievements, up.show_stats
             FROM user u
             LEFT JOIN user_profiles up ON u.id = up.user_id
             WHERE u.id = ?`,
            [targetUserId]
        );
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const user = userRows[0];
        const isOwnProfile = currentUserId === targetUserId;

        // Retrieve follower/following counts and follow status
        const [followersRows] = await pool.execute(
            'SELECT COUNT(*) as count FROM user_follows WHERE following_id = ?',
            [targetUserId]
        );
        const [followingRows] = await pool.execute(
            'SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?',
            [targetUserId]
        );
        const followers = followersRows[0].count;
        const following = followingRows[0].count;

        const [followStatusRows] = await pool.execute(
            'SELECT id FROM user_follows WHERE follower_id = ? AND following_id = ?',
            [currentUserId, targetUserId]
        );
        const isFollowing = followStatusRows.length > 0;

        // Fetch user stats
        const [statsRows] = await pool.execute(
            `SELECT total_workouts, total_exercises, current_streak,
                    longest_streak, total_weight_lifted, total_distance_miles
             FROM user_progress_stats WHERE user_id = ?`,
            [targetUserId]
        );
        let stats = statsRows.length > 0 ? statsRows[0] : null;

        // User level can be computed or stored separately
        const level = stats ? Math.floor(stats.total_workouts / 10) + 1 : 1;

        // Fetch ALL unlocked achievements (no manual selection)
        let showcaseAchievements = [];
        if (user.show_achievements || isOwnProfile) {
            const [achievementRows] = await pool.execute(
                `SELECT a.id, a.name, a.description, a.icon, a.category, a.points, ua.unlocked_at
                 FROM user_achievements ua
                 JOIN achievements a ON ua.achievement_id = a.id
                 WHERE ua.user_id = ?
                 ORDER BY ua.unlocked_at DESC`,
                [targetUserId]
            );
            showcaseAchievements = achievementRows;
        }

        // Fetch recent workouts, respecting privacy
        let recentWorkouts = [];
        if (user.show_workouts || isOwnProfile) {
            const [workoutRows] = await pool.execute(
                `SELECT ws.id, ws.workout_name, ws.completed_at
                 FROM workout_completions wc
                 JOIN workout_sessions ws ON wc.workout_session_id = ws.id
                 WHERE wc.user_id = ?
                 ORDER BY wc.completed_at DESC
                 LIMIT 5`,
                [targetUserId]
            );
            recentWorkouts = workoutRows;
        }

        // Filter stats if privacy disallows
        if (!user.show_stats && !isOwnProfile) {
            stats = null;
        }

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                bio: user.bio,
                location: user.location,
                profile_picture: user.profile_picture,
                profile_color: user.profile_color || '#2563eb',
                joined: user.joined,
                level: level
            },
            followers,
            following,
            isFollowing,
            isOwnProfile,
            stats,
            showcaseAchievements,
            recentWorkouts
        });

    } catch (error) {
        console.error('Error loading profile:', error);
        res.status(500).json({ message: 'Error loading profile.' });
    }
});



// Get any workout (for challenges/feed viewing)
app.get('/api/community/workout/:id', authenticateToken, async (req, res) => {
    const sessionId = req.params.id;

    try {
        const [sessions] = await pool.execute(
            `SELECT 
                ws.id,
                ws.workout_name AS name,
                ws.workout_date AS date,
                ws.completed_at,
                ws.completion_count,
                ws.created_at,
                u.display_name AS owner_name
             FROM workout_sessions ws
             JOIN user u ON ws.user_id = u.id
             WHERE ws.id = ?`,
            [sessionId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({ message: 'Workout not found.' });
        }

        const session = sessions[0];

        const [exerciseRows] = await pool.execute(
            `SELECT 
                exercise_name,
                exercise_type,
                category,
                sets,
                reps,
                weight,
                duration,
                distance
             FROM workouts
             WHERE workout_session_id = ?
             ORDER BY id`,
            [sessionId]
        );

        const exercises = exerciseRows.map(ex => ({
            name: ex.exercise_name,
            type: ex.exercise_type,
            category: ex.category,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight,
            duration: ex.duration,
            distance: ex.distance
        }));

        res.json({
            id: session.id,
            name: session.name,
            owner_name: session.owner_name,
            date: session.date,
            completedAt: session.completed_at,
            completionCount: session.completion_count,
            createdAt: session.created_at,
            exercises
        });
    } catch (error) {
        console.error('Error loading public workout:', error);
        res.status(500).json({ message: 'Error loading workout.' });
    }
});

// Get user's own profile settings
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute('SELECT id, display_name FROM user WHERE email = ?', [userEmail]);
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const userId = userRows[0].id;

        const [profileRows] = await pool.execute('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
        if (profileRows.length === 0) {
            // Insert default profile with privacy fields enabled
            await pool.execute('INSERT INTO user_profiles (user_id, show_workouts, show_achievements) VALUES (?, ?, ?)', 
                [userId, true, true]);
            return res.json({
                user_id: userId,
                display_name: userRows[0].display_name,
                bio: null,
                location: null,
                fitness_goal: null,
                profile_color: '#2563eb',
                show_workouts: true,
                show_achievements: true
            });
        }

        const profile = profileRows[0];
        res.json({
            user_id: userId,
            display_name: userRows[0].display_name,
            bio: profile.bio,
            location: profile.location,
            fitness_goal: profile.fitness_goal,
            profile_color: profile.profile_color || '#2563eb',
            show_workouts: profile.show_workouts,
            show_achievements: profile.show_achievements
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.status(500).json({ message: 'Error loading profile.' });
    }
});


// Update user's profile settings
app.put('/api/user/profile', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;
    const { display_name, bio, location, fitness_goal, profile_color, show_workouts, show_achievements } = req.body;

    try {
        // Get user id
        const [userRows] = await pool.execute('SELECT id FROM user WHERE email = ?', [userEmail]);
        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        const userId = userRows[0].id;

        if (display_name) {
            await pool.execute('UPDATE user SET display_name = ? WHERE id = ?', [display_name, userId]);
        }

        // Save or update profile with privacy settings
        await pool.execute(`
            INSERT INTO user_profiles (
                user_id, bio, location, fitness_goal, profile_color, show_workouts, show_achievements
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                bio = VALUES(bio),
                location = VALUES(location),
                fitness_goal = VALUES(fitness_goal),
                profile_color = VALUES(profile_color),
                show_workouts = VALUES(show_workouts),
                show_achievements = VALUES(show_achievements)
        `, [
            userId,
            bio,
            location,
            fitness_goal,
            profile_color,
            !!show_workouts,
            !!show_achievements
        ]);

        res.json({ message: 'Profile updated successfully!' });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Error updating profile.' });
    }
});



// Follow/Unfollow user
app.post('/api/community/follow/:userId', authenticateToken, async (req, res) => {
    const targetUserId = req.params.userId;
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );
        const userId = userRows[0].id;

        const [existing] = await pool.execute(
            'SELECT id FROM user_follows WHERE follower_id = ? AND following_id = ?',
            [userId, targetUserId]
        );

        if (existing.length > 0) {
            await pool.execute(
                'DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?',
                [userId, targetUserId]
            );
            res.json({ message: 'Unfollowed successfully', following: false });
        } else {
            await pool.execute(
                'INSERT INTO user_follows (follower_id, following_id) VALUES (?, ?)',
                [userId, targetUserId]
            );

            await pool.execute(
                `INSERT INTO notifications (user_id, type, from_user_id, message)
                VALUES (?, 'follow', ?, 'started following you')`,
                [targetUserId, userId]
            );

            res.json({ message: 'Followed successfully', following: true });
        }
    } catch (error) {
        console.error('Error following user:', error);
        res.status(500).json({ message: 'Error following user.' });
    }
});

// Get following list
app.get('/api/community/following', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );
        const userId = userRows[0].id;

        const [following] = await pool.execute(
            `SELECT u.id, u.display_name, up.profile_picture, up.bio,
                (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as followers_count
            FROM user_follows uf
            JOIN user u ON uf.following_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE uf.follower_id = ?
            ORDER BY uf.created_at DESC`,
            [userId]
        );

        res.json(following);
    } catch (error) {
        console.error('Error loading following:', error);
        res.status(500).json({ message: 'Error loading following.' });
    }
});

// Send workout challenge
app.post('/api/community/challenge', authenticateToken, async (req, res) => {
    const { targetUserId, workoutSessionId, message } = req.body;
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );
        const userId = userRows[0].id;

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await pool.execute(
            `INSERT INTO workout_challenges 
            (challenger_id, challenged_id, workout_session_id, message, expires_at)
            VALUES (?, ?, ?, ?, ?)`,
            [userId, targetUserId, workoutSessionId, message, expiresAt]
        );

        const [workout] = await pool.execute(
            'SELECT workout_name FROM workout_sessions WHERE id = ?',
            [workoutSessionId]
        );

        await pool.execute(
            `INSERT INTO notifications (user_id, type, from_user_id, reference_id, message)
            VALUES (?, 'challenge', ?, ?, ?)`,
            [targetUserId, userId, workoutSessionId, `challenged you to: ${workout[0].workout_name}`]
        );

        res.status(201).json({ message: 'Challenge sent!' });
    } catch (error) {
        console.error('Error sending challenge:', error);
        res.status(500).json({ message: 'Error sending challenge.' });
    }
});

// Get user's challenges (received)
app.get('/api/community/challenges/received', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );
        const userId = userRows[0].id;

        const [challenges] = await pool.execute(
            `SELECT 
                c.*,
                ws.workout_name,
                challenger.display_name as challenger_name,
                challenged.display_name as challenged_name
            FROM workout_challenges c
            JOIN workout_sessions ws ON c.workout_session_id = ws.id
            JOIN user challenger ON c.challenger_id = challenger.id
            JOIN user challenged ON c.challenged_id = challenged.id
            WHERE c.challenged_id = ?
            AND c.status != 'expired'
            ORDER BY c.created_at DESC`,
            [userId]
        );

        res.json(challenges);
    } catch (error) {
        console.error('Error loading challenges:', error);
        res.status(500).json({ message: 'Error loading challenges.' });
    }
});

// Get user's challenges (sent)
app.get('/api/community/challenges/sent', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );
        const userId = userRows[0].id;

        const [challenges] = await pool.execute(
            `SELECT 
                c.*,
                ws.workout_name,
                challenger.display_name as challenger_name,
                challenged.display_name as challenged_name
            FROM workout_challenges c
            JOIN workout_sessions ws ON c.workout_session_id = ws.id
            JOIN user challenger ON c.challenger_id = challenger.id
            JOIN user challenged ON c.challenged_id = challenged.id
            WHERE c.challenger_id = ?
            AND c.status != 'expired'
            ORDER BY c.created_at DESC`,
            [userId]
        );

        res.json(challenges);
    } catch (error) {
        console.error('Error loading challenges:', error);
        res.status(500).json({ message: 'Error loading challenges.' });
    }
});
// Complete a challenge workout (logs history + stats + feed, no saved workout)
app.post('/api/community/challenge/:id/complete', authenticateToken, async (req, res) => {
  const challengeId = req.params.id;
  const userEmail = req.user.email;

  try {
    // Get user ID from email
    const [userRows] = await pool.execute(
      'SELECT id FROM user WHERE email = ?',
      [userEmail]
    );
    if (!userRows.length) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const userId = userRows[0].id;

    // Get challenge data with workout session and challenger info
    const [challengeRows] = await pool.execute(
      `SELECT c.*, ws.workout_name, ws.workout_date, 
              challenger.display_name AS challenger_name
       FROM workout_challenges c
       JOIN workout_sessions ws ON c.workout_session_id = ws.id
       JOIN user challenger ON c.challenger_id = challenger.id
       WHERE c.id = ? AND c.challenged_id = ?`,
      [challengeId, userId]
    );
    if (!challengeRows.length) {
      return res.status(404).json({ message: 'Challenge not found.' });
    }
    const challenge = challengeRows[0];

    // Load exercises for the session
    const [exerciseRows] = await pool.execute(
      `SELECT exercise_name, exercise_type, category, sets, reps, weight, duration, distance
       FROM workouts
       WHERE workout_session_id = ?
       ORDER BY id`,
      [challenge.workout_session_id]
    );

    const completedAt = new Date();
    const exercisesData = exerciseRows.map(ex => ({
      name: ex.exercise_name,
      type: ex.exercise_type,
      category: ex.category,
      sets: ex.sets,
      reps: ex.reps,
      weight: ex.weight,
      duration: ex.duration,
      distance: ex.distance
    }));

    // Insert workout completion history
    await pool.execute(
      `INSERT INTO workout_completions 
           (user_id, workout_session_id, workout_name, completed_at, exercises_data)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, challenge.workout_session_id, challenge.workout_name, completedAt, JSON.stringify(exercisesData)]
    );

    // Insert exercise history and update personal records
    for (const exercise of exercisesData) {
      await pool.execute(
        `INSERT INTO exercise_history
           (user_id, workout_session_id, exercise_name, category, sets, reps, weight, duration, distance, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, challenge.workout_session_id, exercise.name, exercise.category,
         exercise.sets || null, exercise.reps || null, exercise.weight || null,
         exercise.duration || null, exercise.distance || null, completedAt]
      );

      await pool.execute(
        `INSERT INTO exercise_personal_records
           (user_id, exercise_name, category, max_weight, max_reps, max_sets, longest_duration, longest_distance, times_performed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           max_weight = GREATEST(COALESCE(max_weight, 0), COALESCE(VALUES(max_weight), 0)),
           max_reps = GREATEST(COALESCE(max_reps, 0), COALESCE(VALUES(max_reps), 0)),
           max_sets = GREATEST(COALESCE(max_sets, 0), COALESCE(VALUES(max_sets), 0)),
           longest_duration = GREATEST(COALESCE(longest_duration, 0), COALESCE(VALUES(longest_duration), 0)),
           longest_distance = GREATEST(COALESCE(longest_distance, 0), COALESCE(VALUES(longest_distance), 0)),
           times_performed = times_performed + 1`,
        [userId, exercise.name, exercise.category, exercise.weight || null,
         exercise.reps || null, exercise.sets || null, exercise.duration || null,
         exercise.distance || null]
      );
    }

    // Update stats and unlock achievements
    await updateUserProgressStats(userId);
    const newAchievements = await checkAndUnlockAchievements(userId);

    // Mark challenge as completed
    await pool.execute(
      'UPDATE workout_challenges SET status = ? WHERE id = ? AND challenged_id = ?',
      ['completed', challengeId, userId]
    );

    // Create custom feed post
    await createFeedPost(
      userId,
      'workout',
      `Completed a challenge from ${challenge.challenger_name}: ${challenge.workout_name}`,
      null,
      challenge.workout_session_id
    );

    res.json({ message: 'Challenge workout completed and logged.', newAchievements });

  } catch (error) {
    console.error('Error completing challenge:', error);
    res.status(500).json({ message: 'Error completing challenge.' });
  }
});
// Accept or Decline a challenge
app.post('/api/community/challenge/:id/:action', authenticateToken, async (req, res) => {
  const challengeId = req.params.id;
  const action = req.params.action;
  const userEmail = req.user.email;

  if (action !== 'accept' && action !== 'decline') {
    return res.status(400).json({ message: 'Invalid challenge action.' });
  }

  try {
    const [userRows] = await pool.execute(
      'SELECT id FROM user WHERE email = ?',
      [userEmail]
    );
    const userId = userRows[0].id;

    const status = action === 'accept' ? 'accepted' : 'declined';

    await pool.execute(
      'UPDATE workout_challenges SET status = ? WHERE id = ? AND challenged_id = ?',
      [status, challengeId, userId]
    );

    res.json({ message: `Challenge ${status}!` });
  } catch (error) {
    console.error('Error updating challenge:', error);
    res.status(500).json({ message: 'Error updating challenge.' });
  }
});



// Cancel challenge (for sender)
app.delete('/api/community/challenge/:id', authenticateToken, async (req, res) => {
    const challengeId = req.params.id;
    const userEmail = req.user.email;

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );
        const userId = userRows[0].id;

        await pool.execute(
            'DELETE FROM workout_challenges WHERE id = ? AND challenger_id = ?',
            [challengeId, userId]
        );

        res.json({ message: 'Challenge cancelled!' });
    } catch (error) {
        console.error('Error cancelling challenge:', error);
        res.status(500).json({ message: 'Error cancelling challenge.' });
    }
});

// Get community feed
app.get('/api/community/feed', authenticateToken, async (req, res) => {
    const userEmail = req.user.email;
    const followingOnly = req.query.following === 'true';

    try {
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        const userId = userRows[0].id;

        let query = `
            SELECT 
                p.id,
                p.user_id,
                p.post_type,
                p.content,
                p.achievement_id,
                p.workout_id,
                p.created_at,
                u.display_name AS user_name,
                up.profile_picture,
                up.profile_color
            FROM user_posts p
            JOIN user u ON p.user_id = u.id
            LEFT JOIN user_profiles up ON u.id = up.user_id
        `;

        let params = [];

        if (followingOnly) {
            // Only people I follow (no self)
            query += `
                WHERE p.user_id IN (
                    SELECT following_id FROM user_follows WHERE follower_id = ?
                )
            `;
            params = [userId];
        } else {
            // Everyone (including me)
            query += ` WHERE 1 = 1`;
        }

        query += ` ORDER BY p.created_at DESC LIMIT 50`;

        const [posts] = await pool.execute(query, params);
        res.json(posts);
    } catch (error) {
        console.error('Error loading feed:', error);
        res.status(500).json({ message: 'Error loading feed.' });
    }
});


// Search users
app.get('/api/community/search', authenticateToken, async (req, res) => {
    const query = req.query.q || '';
    const userEmail = req.user.email;

    try {
        const [currentUser] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );
        const currentUserId = currentUser[0].id;

        const [users] = await pool.execute(
            `SELECT 
                u.id, u.display_name, u.email,
                up.profile_picture, up.bio, up.profile_color,
                (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as followers_count
            FROM user u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE (u.display_name LIKE ? OR u.email LIKE ?)
            AND u.id != ?
            ORDER BY followers_count DESC
            LIMIT 20`,
            [`%${query}%`, `%${query}%`, currentUserId]
        );

        res.json(users);
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ message: 'Error searching users.' });
    }
});

// Get leaderboard
app.get('/api/community/leaderboard/:criteria', authenticateToken, async (req, res) => {
    const criteria = req.params.criteria; // 'xp', 'workouts', 'streak'

    try {
        let orderBy = 'total_points DESC';
        
        if (criteria === 'workouts') {
            orderBy = 'ups.total_workouts DESC';
        } else if (criteria === 'streak') {
            orderBy = 'ups.current_streak DESC, ups.longest_streak DESC';
        }

        const [leaderboard] = await pool.execute(
            `SELECT 
                u.id, u.display_name,
                up.profile_picture, up.profile_color,
                ups.total_workouts,
                ups.total_exercises,
                ups.current_streak,
                ups.longest_streak,
                COALESCE(SUM(a.points), 0) as total_points
            FROM user u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            LEFT JOIN user_progress_stats ups ON u.id = ups.user_id
            LEFT JOIN user_achievements ua ON u.id = ua.user_id
            LEFT JOIN achievements a ON ua.achievement_id = a.id
            GROUP BY u.id
            ORDER BY ${orderBy}
            LIMIT 100`,
            []
        );

        res.json(leaderboard);
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        res.status(500).json({ message: 'Error loading leaderboard.' });
    }
});


// Start the server  <-- This stays here
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});