const User = require('../../models/userSchema');

const LoadUser = async (req, res) => {
    try {
        let search = '';
        if (req.query.search) {
            search = req.query.search.trim();
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 3;

        const users = await User.find({
            isAdmin: false,
            $or: [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        });

        res.render('user', {
            user: users,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            search
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Something went wrong while loading users' });
    }
};

const unblockUser = async (req, res) => {
    try {
        const id = req.params.id;

        const user = await User.findByIdAndUpdate(id, { $set: { isBlocked: false } });

        if (!user) {
            return res.json({ success: false, message: 'User not found!' });
        }

        return res.json({ success: true, message: 'User unblocked successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const blockUser = async (req, res) => {
    try {
        const id = req.params.id;

        const user = await User.findByIdAndUpdate(id, { $set: { isBlocked: true } });

        if (!user) {
            return res.json({ success: false, message: 'User not found!' });
        }

        return res.json({ success: true, message: 'User blocked successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    LoadUser,
    unblockUser,
    blockUser
};