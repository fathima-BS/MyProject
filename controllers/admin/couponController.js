const Coupon = require('../../models/couponSchema');

const loadCoupon = async (req, res, next) => {
    try {
        let search = '';
        if (req.query.search) {
            search = req.query.search.trim();
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 3;

        const coupons = await Coupon.find({
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { couponCode: { $regex: search, $options: 'i' } }
            ]
        })
            .sort({ createdOn: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await Coupon.countDocuments({
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { couponCode: { $regex: search, $options: 'i' } }
            ]
        });

        res.render('coupon', {
            coupons,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            search
        });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const addCoupon = async (req, res, next) => {
    try {
        const { name, couponCode, description, minimumPrice, offerPrice, createdOn, expireOn } = req.body;

        function escapeRegex(str) {
            return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        const existingCoupon = await Coupon.findOne({
            name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' }
        });

        if (existingCoupon) {
            return res.json({ success: false, message: 'Coupon already exists!' });
        }

        const newCoupon = new Coupon({
            name,
            couponCode,
            description,
            minimumPrice: Number(minimumPrice),
            offerPrice: Number(offerPrice),
            createdOn: new Date(createdOn),
            expireOn: new Date(expireOn)
        });

        await newCoupon.save()
        return res.json({ success: true, message: 'Coupon added successfully!' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const editCoupon = async (req, res, next) => {
    try {
        const { couponId, name, couponCode, description, minimumPrice, offerPrice, createdOn, expireOn } = req.body;

        function escapeRegex(str) {
            return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        const nameRegex = new RegExp(`^${escapeRegex(name)}$`, "i");

        const existingCoupon = await Coupon.findOne({
            _id: { $ne: couponId },
            name: nameRegex
        });

        if (existingCoupon) {
            return res.json({ success: false, message: 'Coupon already exists!' });
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(couponId, {
            $set: {
                name,
                couponCode,
                description,
                minimumPrice: Number(minimumPrice),
                offerPrice: Number(offerPrice),
                createdOn: new Date(createdOn),
                expireOn: new Date(expireOn)
            }
        });

        if (!updatedCoupon) {
            return res.json({ success: false, message: 'Coupon not found!' });
        }

        return res.json({ success: true, message: 'Coupon updated successfully!' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const deleteCoupon = async (req, res, next) => {
    try {
        const id = req.params.id;

        const coupon = await Coupon.findByIdAndDelete(id);

        if (!coupon) {
            return res.json({ success: false, message: 'Coupon not found!' });
        }

        return res.json({ success: true, message: 'Coupon deleted successfully' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

module.exports = {
    loadCoupon,
    addCoupon,
    editCoupon,
    deleteCoupon
};