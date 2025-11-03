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
    } catch (error) {
        console.error('Error updating user progress stats:', error);
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

        res.status(200).json({ message: 'Workout completed!' });
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

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
