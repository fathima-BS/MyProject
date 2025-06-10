const User = require('../../models/userSchema');

const loadUser = async (req, res, next) => {
    try {
        let search = '';
        if (req.query.search) {
            search = req.query.search.trim();
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 5;

        const users = await User.find({
            isAdmin: false,

            $or: [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(limit * 1)
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
        error.statusCode = 500;
        next(error)
    }
};

const unblockUser = async (req, res, next) => {
    try {
        const id = req.params.id;

        const user = await User.findByIdAndUpdate(id, { $set: { isBlocked: false } });

        if (!user) {
            return res.json({ success: false, message: 'User not found!' });
        }

        return res.json({ success: true, message: 'User unblocked successfully' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const blockUser = async (req, res, next) => {
    try {
        const id = req.params.id;

        const user = await User.findByIdAndUpdate(id, { $set: { isBlocked: true } });

        if (!user) {
            return res.json({ success: false, message: 'User not found!' });
        }

        return res.json({ success: true, message: 'User blocked successfully' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

module.exports = {
    loadUser,
    unblockUser,
    blockUser
};