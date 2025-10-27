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
// **Authorization Middleware: Verify JWT Token and Check User in Database**
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
            // Use pool directly - no need to create/close connections
            const [rows] = await pool.execute(
                'SELECT email FROM user WHERE email = ?',
                [decoded.email]
            );

            if (rows.length === 0) {
                return res.status(403).json({ message: 'Account not found or deactivated.' });
            }

            req.user = decoded;  // Save the decoded email for use in the route
            next();  // Proceed to the next middleware or route handler
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
        // Get user_id from email
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        // Insert workout session
        const [sessionResult] = await pool.execute(
            'INSERT INTO workout_sessions (user_id, workout_name, workout_date) VALUES (?, ?, ?)',
            [userId, name, date || new Date()]
        );

        const sessionId = sessionResult.insertId;

        // Insert all exercises for this workout
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
        // Get user_id from email
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        // Get all workout sessions with their exercises
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

        // Group exercises by workout session
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

// Mark a workout as completed
app.post('/api/workouts/:id/complete', authenticateToken, async (req, res) => {
    const workoutId = req.params.id;
    const userEmail = req.user.email;

    try {
        // Get user_id from email
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        // Update completed_at and increment completion_count
        const [result] = await pool.execute(
            `UPDATE workout_sessions 
             SET completed_at = NOW(), 
                 completion_count = completion_count + 1 
             WHERE id = ? AND user_id = ?`,
            [workoutId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Workout not found.' });
        }

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
        // Get user_id from email
        const [userRows] = await pool.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        // Delete workout (exercises are cascade deleted)
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

//////////////////////////////////////
//END ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
