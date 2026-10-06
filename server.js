// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");

// ✅ Create app FIRST
const app = express();

// ✅ Then use middleware
app.use(cors());
app.use(express.json());

// ✅ Port
const PORT = 5000;

// ✅ MongoDB Connection
mongoose.connect("mongodb://127.0.0.1:27017/talaanDB")
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ MongoDB Error:", err));


// -------------------------------------------------------------------
// 1. SCHEMAS
// -------------------------------------------------------------------

// User Schema (Unchanged)
const userSchema = new mongoose.Schema({
    username: String,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetToken: String,
    resetTokenExpiry: Date,
});
const User = mongoose.model('User', userSchema);

// ** NEW CATEGORY SCHEMA **
const categorySchema = new mongoose.Schema({
    // Associate the category with a user (makes it private to the user)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    name: { type: String, required: true },
    icon: { type: String, default: '&#9889;' }, // E.g., emoji or image URL
    color: { type: String, default: '#7f8c8d' }, // Hex color for styling
    colorClass: { type: String, required: true, unique: false }, // CSS class name
    isDefault: { type: Boolean, default: false } // For initial, pre-set categories
});
// Ensure the combination of name and userId is unique to prevent duplicate categories for one user
categorySchema.index({ name: 1, userId: 1 }, { unique: true });
const Category = mongoose.model('Category', categorySchema);

// Task Schema (Unchanged)
const taskSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    text: { type: String, required: true },
    category: { type: String, default: 'Other' },
    dueDate: { type: String, default: '' },
    dueTime: { type: String, default: '' },
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', taskSchema);

// -------------------------------------------------------------------
// 2. AUTHENTICATION ROUTES (Unchanged)
// -------------------------------------------------------------------

// Register Route
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        // 💡 OPTIONAL: Automatically create default categories for new users
        const defaultCategories = [
             { name: 'Personal', icon: '&#128100;', color: '#ff5d12', colorClass: 'personal', isDefault: true },
             { name: 'Work', icon: '&#128187;', color: '#083cb5', colorClass: 'work', isDefault: true },
             { name: 'Study', icon: '&#128218;', color: '#00b894', colorClass: 'study', isDefault: true },
             { name: 'Other', icon: '&#9889;', color: '#7f8c8d', colorClass: 'other', isDefault: true }
        ];

        const categoryPromises = defaultCategories.map(cat => 
            new Category({ ...cat, userId: newUser._id }).save()
        );
        await Promise.all(categoryPromises);


        res.status(201).json({ message: 'User registered and default categories created successfully!' });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Email already in use.' });
        }
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login Route (Unchanged)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        res.json({ 
            message: 'Login successful!', 
            userId: user._id,
            username: user.username
        });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// Forgot Password Route - Generate Reset Token
app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'Email not found' });

        // Generate a random 6-digit code for simplicity (or use crypto for more security)
        const resetCode = Math.random().toString().substring(2, 8);
        const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

        user.resetToken = resetCode;
        user.resetTokenExpiry = resetTokenExpiry;
        await user.save();

        // In a real app, you would send an email here with the reset code
        // For now, we'll return it (NOT SECURE - only for development)
        res.json({ 
            message: 'Reset code sent to your email (Check console for development)', 
            resetCode: resetCode // Remove in production
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to process forgot password' });
    }
});

// Reset Password Route - Update Password
app.post('/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        await user.save();

        res.json({ message: 'Password reset successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Password reset failed' });
    }
});

// -------------------------------------------------------------------
// 3. CATEGORY CRUD ROUTES (NEW)
// -------------------------------------------------------------------

// CREATE Category
app.post('/categories', async (req, res) => {
    const { userId, name, icon, color, colorClass } = req.body;
    
    if (!userId || !name || !color || !colorClass) {
        return res.status(400).json({ error: 'User ID, name, color, and colorClass are required.' });
    }

    try {
        const newCategory = new Category({ userId, name, icon, color, colorClass, isDefault: false });
        await newCategory.save();
        res.status(201).json(newCategory);
    } catch (err) {
        if (err.code === 11000) {
             return res.status(400).json({ error: 'A category with this name already exists for this user.' });
        }
        res.status(500).json({ error: 'Failed to create category' });
    }
});

// READ All Categories for a specific user
app.get('/categories/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const categories = await Category.find({ userId }).sort({ isDefault: -1, name: 1 }); // Sort defaults first
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// DELETE Category
app.delete('/categories/:id', async (req, res) => {
    const categoryId = req.params.id;
    // NOTE: In a real app, check userId ownership before deleting.
    try {
        const deletedCategory = await Category.findByIdAndDelete(categoryId);
        
        if (!deletedCategory) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        // OPTIONAL: Update any tasks that used this category to a 'default' or 'other' category
        await Task.updateMany(
            { category: deletedCategory.name, userId: deletedCategory.userId },
            { $set: { category: 'Other' } }
        );

        res.json({ message: 'Category deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
});


// -------------------------------------------------------------------
// 4. TO-DO LIST CRUD ROUTES (Minor change to check for taskId + userId in PUT)
// -------------------------------------------------------------------

// CREATE Task (Unchanged)
app.post('/tasks', async (req, res) => {
    const { userId, text, category, dueDate, dueTime } = req.body;
    
    if (!userId || !text) {
        return res.status(400).json({ error: 'User ID and task text are required.' });
    }

    try {
        const newTask = new Task({
            userId,
            text,
            category,
            dueDate,
            dueTime,
            completed: false
        });
        await newTask.save();
        res.status(201).json(newTask);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// READ All Tasks for a specific user (Unchanged)
app.get('/tasks/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const tasks = await Task.find({ userId });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// UPDATE Task (Unchanged)
app.put('/tasks/:id', async (req, res) => {
    const taskId = req.params.id;
    const { text, category, dueDate, dueTime, completed, userId } = req.body;
    
    try {
        const updatedTask = await Task.findOneAndUpdate(
            { _id: taskId, userId: userId }, // Use both for security check
            { $set: { text, category, dueDate, dueTime, completed } },
            { new: true } 
        );

        if (!updatedTask) {
            return res.status(404).json({ error: 'Task not found or user unauthorized' });
        }
        res.json(updatedTask);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// DELETE Task (Unchanged)
app.delete('/tasks/:id', async (req, res) => {
    const taskId = req.params.id;
    try {
        const deletedTask = await Task.findByIdAndDelete(taskId);
        
        if (!deletedTask) {
            return res.status(404).json({ error: 'Task not found' });
        }
        res.json({ message: 'Task deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

