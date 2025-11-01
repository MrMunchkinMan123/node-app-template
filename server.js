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

// Update exercise history (log every exercise performed)
async function logExerciseHistory(userId, workoutSessionId, exercises, performedAt) {
    try {
        for (const exercise of exercises) {
            await pool.execute(
                `INSERT INTO exercise_history 
                (user_id, workout_session_id, exercise_name, exercise_type, category, 
                 sets, reps, weight, duration, distance, performed_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    workoutSessionId,
                    exercise.name,
                    exercise.type,
                    exercise.category,
                    exercise.sets || null,
                    exercise.reps || null,
                    exercise.weight || null,
                    exercise.duration || null,
                    exercise.distance || null,
                    performedAt
                ]
            );
        }
    } catch (error) {
        console.error('Error logging exercise history:', error);
    }
}

// Update personal records for each exercise
async function updatePersonalRecords(userId, exercises, performedAt) {
    try {
        for (const exercise of exercises) {
            // Check if record exists
            const [existing] = await pool.execute(
                'SELECT * FROM exercise_personal_records WHERE user_id = ? AND exercise_name = ?',
                [userId, exercise.name]
            );

            const weight = parseFloat(exercise.weight) || 0;
            const reps = parseInt(exercise.reps) || 0;
            const sets = parseInt(exercise.sets) || 0;
            const duration = parseInt(exercise.duration) || 0;
            const distance = parseFloat(exercise.distance) || 0;

            if (existing.length === 0) {
                // Create new record
                await pool.execute(
                    `INSERT INTO exercise_personal_records 
                    (user_id, exercise_name, category, times_performed, last_performed,
                     max_weight, max_weight_date, max_reps, max_reps_date, 
                     max_sets, max_sets_date, longest_duration, longest_duration_date,
                     longest_distance, longest_distance_date,
                     total_weight_lifted, total_reps, total_sets, total_duration, total_distance,
                     avg_weight, avg_reps)
                    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        userId, exercise.name, exercise.category, performedAt,
                        weight > 0 ? weight : null, weight > 0 ? performedAt : null,
                        reps > 0 ? reps : null, reps > 0 ? performedAt : null,
                        sets > 0 ? sets : null, sets > 0 ? performedAt : null,
                        duration > 0 ? duration : null, duration > 0 ? performedAt : null,
                        distance > 0 ? distance : null, distance > 0 ? performedAt : null,
                        weight * sets * reps, reps * sets, sets, duration, distance,
                        weight > 0 ? weight : null, reps > 0 ? reps : null
                    ]
                );
            } else {
                // Update existing record
                const record = existing[0];
                const newTimesPerformed = record.times_performed + 1;
                const newTotalWeight = record.total_weight_lifted + (weight * sets * reps);
                const newTotalReps = record.total_reps + (reps * sets);
                const newTotalSets = record.total_sets + sets;
                const newTotalDuration = record.total_duration + duration;
                const newTotalDistance = record.total_distance + distance;

                await pool.execute(
                    `UPDATE exercise_personal_records SET
                        times_performed = ?,
                        last_performed = ?,
                        max_weight = GREATEST(COALESCE(max_weight, 0), ?),
                        max_weight_date = IF(? > COALESCE(max_weight, 0), ?, max_weight_date),
                        max_reps = GREATEST(COALESCE(max_reps, 0), ?),
                        max_reps_date = IF(? > COALESCE(max_reps, 0), ?, max_reps_date),
                        max_sets = GREATEST(COALESCE(max_sets, 0), ?),
                        max_sets_date = IF(? > COALESCE(max_sets, 0), ?, max_sets_date),
                        longest_duration = GREATEST(COALESCE(longest_duration, 0), ?),
                        longest_duration_date = IF(? > COALESCE(longest_duration, 0), ?, longest_duration_date),
                        longest_distance = GREATEST(COALESCE(longest_distance, 0), ?),
                        longest_distance_date = IF(? > COALESCE(longest_distance, 0), ?, longest_distance_date),
                        total_weight_lifted = ?,
                        total_reps = ?,
                        total_sets = ?,
                        total_duration = ?,
                        total_distance = ?,
                        avg_weight = ? / ?,
                        avg_reps = ? / ?
                    WHERE user_id = ? AND exercise_name = ?`,
                    [
                        newTimesPerformed, performedAt,
                        weight, weight, performedAt,
                        reps, reps, performedAt,
                        sets, sets, performedAt,
                        duration, duration, performedAt,
                        distance, distance, performedAt,
                        newTotalWeight, newTotalReps, newTotalSets, newTotalDuration, newTotalDistance,
                        newTotalWeight, newTimesPerformed,
                        newTotalReps, newTimesPerformed,
                        userId, exercise.name
                    ]
                );
            }
        }
    } catch (error) {
        console.error('Error updating personal records:', error);
    }
}

// Calculate and update user progress stats
async function updateUserProgressStats(userId) {
    try {
        // Check if stats exist
        const [existing] = await pool.execute(
            'SELECT * FROM user_progress_stats WHERE user_id = ?',
            [userId]
        );

        // Get total workouts completed
        const [workoutStats] = await pool.execute(
            `SELECT 
                COUNT(DISTINCT id) as total_workouts,
                MIN(completed_at) as first_workout,
                MAX(completed_at) as last_workout
            FROM workout_sessions 
            WHERE user_id = ? AND completed_at IS NOT NULL`,
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

        // Calculate streak
        const [completedDates] = await pool.execute(
            `SELECT DISTINCT DATE(completed_at) as workout_date
            FROM workout_sessions
            WHERE user_id = ? AND completed_at IS NOT NULL
            ORDER BY workout_date DESC`,
            [userId]
        );

        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < completedDates.length; i++) {
            const date = new Date(completedDates[i].workout_date);
            const expectedDate = new Date(today);
            expectedDate.setDate(today.getDate() - i);
            expectedDate.setHours(0, 0, 0, 0);

            if (date.getTime() === expectedDate.getTime()) {
                currentStreak++;
                tempStreak++;
            } else {
                tempStreak = 1;
            }
            longestStreak = Math.max(longestStreak, tempStreak);
        }

        // This week and month counts
        const [weekStats] = await pool.execute(
            `SELECT 
                COUNT(*) as this_week
            FROM workout_sessions
            WHERE user_id = ? 
            AND completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            AND completed_at IS NOT NULL`,
            [userId]
        );

        const [monthStats] = await pool.execute(
            `SELECT 
                COUNT(*) as this_month
            FROM workout_sessions
            WHERE user_id = ? 
            AND completed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            AND completed_at IS NOT NULL`,
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
// Default route to serve logon.html
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

//////////////////////////////////////
//END ROUTES TO SERVE HTML FILES
//////////////////////////////////////

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
/////////////////////////////////////////////////
//END AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////

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

// Mark a workout as completed (NOW WITH TRACKING!)
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

        // Get workout exercises
        const [exercises] = await pool.execute(
            `SELECT exercise_name as name, exercise_type as type, category, 
                    sets, reps, weight, duration, distance
            FROM workouts WHERE workout_session_id = ?`,
            [workoutId]
        );

        const performedAt = new Date();

        // Update workout session
        const [result] = await pool.execute(
            `UPDATE workout_sessions 
             SET completed_at = ?, 
                 completion_count = completion_count + 1 
             WHERE id = ? AND user_id = ?`,
            [performedAt, workoutId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Workout not found.' });
        }

        // Log to exercise history
        await logExerciseHistory(userId, workoutId, exercises, performedAt);

        // Update personal records
        await updatePersonalRecords(userId, exercises, performedAt);

        // Update overall user stats
        await updateUserProgressStats(userId);

        res.status(200).json({ message: 'Workout marked as complete!' });
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

        const [result] = await pool.execute(
            'DELETE FROM workout_sessions WHERE id = ? AND user_id = ?',
            [workoutId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Workout not found.' });
        }

        // Recalculate stats after deletion
        await updateUserProgressStats(userId);

        res.status(200).json({ message: 'Workout deleted successfully!' });
    } catch (error) {
        console.error('Error deleting workout:', error);
        res.status(500).json({ message: 'Error deleting workout.' });
    }
});

// NEW: Get user progress stats
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

// NEW: Get personal records
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

//////////////////////////////////////
//END ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
