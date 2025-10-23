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
//ROUTES TO SERVE HTML FILES
//////////////////////////////////////
// Default route to serve logon.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/logon.html');
});

// Route to serve dashboard.html
// app.get('/dashboard', (req, res) => {
//     res.sendFile(__dirname + '/public/dashboard.html');
// });

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
//HELPER FUNCTIONS AND AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////
// Helper function to create a MySQL connection
async function createConnection() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        // ✅ Log which database you're connected to
        const [rows] = await connection.query('SELECT DATABASE() AS current_db');
        console.log('🔍 Connected to DB:', rows[0].current_db);

        return connection;
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        throw err;
    }
}

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
            const connection = await createConnection();

            // Query the database to verify that the email is associated with an active account
            const [rows] = await connection.execute(
                'SELECT email FROM user WHERE email = ?',
                [decoded.email]
            );

            await connection.end();  // Close connection

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
//END HELPER FUNCTIONS AND AUTHENTICATION MIDDLEWARE
/////////////////////////////////////////////////


//////////////////////////////////////
//ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////
// Route: Create Account
// Route: Create Account
app.post('/api/create-account', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email and password are required.' });
    }

    try {
        const connection = await createConnection();
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await connection.execute(
            'INSERT INTO user (email, password, display_name) VALUES (?, ?, ?)',
            [email, hashedPassword, name]
        );
        await connection.end();
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
        const connection = await createConnection();
        const [rows] = await connection.execute(
            'SELECT * FROM user WHERE email = ?',
            [email]
        );
        await connection.end();

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
        const connection = await createConnection();

        const [rows] = await connection.execute('SELECT email FROM user');

        await connection.end();  // Close connection

        const emailList = rows.map((row) => row.email);
        res.status(200).json({ emails: emailList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving email addresses.' });
    }
});
//////////////////////////////////////
//END ROUTES TO HANDLE API REQUESTS
//////////////////////////////////////
// Add after your existing routes, before app.listen()

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
        const connection = await createConnection();
        
        // Get user_id from email
        const [userRows] = await connection.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        // Insert workout session
        const [sessionResult] = await connection.execute(
            'INSERT INTO workout_sessions (user_id, workout_name, workout_date) VALUES (?, ?, ?)',
            [userId, name, date || new Date()]
        );

        const sessionId = sessionResult.insertId;

        // Insert all exercises for this workout
        for (const exercise of exercises) {
            await connection.execute(
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

        await connection.end();
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
        const connection = await createConnection();
        
        // Get user_id from email
        const [userRows] = await connection.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        // Get all workout sessions with their exercises
        // Order by completed_at if exists, otherwise by created_at (DESC = newest first)
        const [sessions] = await connection.execute(
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

        await connection.end();

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


// Mark a workout as completed (updates last completed date and count)
app.post('/api/workouts/:id/complete', authenticateToken, async (req, res) => {
    const workoutId = req.params.id;
    const userEmail = req.user.email;

    try {
        const connection = await createConnection();
        
        // Get user_id from email
        const [userRows] = await connection.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        // Update completed_at and increment completion_count
        const [result] = await connection.execute(
            `UPDATE workout_sessions 
             SET completed_at = NOW(), 
                 completion_count = completion_count + 1 
             WHERE id = ? AND user_id = ?`,
            [workoutId, userId]
        );

        await connection.end();

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
        const connection = await createConnection();
        
        // Get user_id from email
        const [userRows] = await connection.execute(
            'SELECT id FROM user WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            await connection.end();
            return res.status(404).json({ message: 'User not found.' });
        }

        const userId = userRows[0].id;

        // Delete workout (exercises are cascade deleted)
        const [result] = await connection.execute(
            'DELETE FROM workout_sessions WHERE id = ? AND user_id = ?',
            [workoutId, userId]
        );

        await connection.end();

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Workout not found.' });
        }

        res.status(200).json({ message: 'Workout deleted successfully!' });
    } catch (error) {
        console.error('Error deleting workout:', error);
        res.status(500).json({ message: 'Error deleting workout.' });
    }
});


// Start the server

(async () => {
    try {
        const testConn = await createConnection();
        await testConn.end();
    } catch (err) {
        console.error('❌ Failed to connect to DB at startup:', err.message);
    }
})();

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// state

// state for me