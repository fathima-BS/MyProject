const Offer = require('../../models/offerSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const Product = require('../../models/productSchema');
const mongoose = require('mongoose');
const loadOffers = async (req, res, next) => {
    try {
        let search = '';
        if (req.query.search) {
            search = req.query.search.trim();
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 3;

        const offers = await Offer.find({
            $or: [
                { offerName: { $regex: search, $options: 'i' } }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .populate('applicableTo')
            .exec();

        const count = await Offer.countDocuments({
            $or: [
                { offerName: { $regex: search, $options: 'i' } }
            ]
        });

        // Fetch only non-deleted brands, categories, and products for dropdowns
        const brands = await Brand.find({ isDeleted: { $ne: true } }).exec();
        const categories = await Category.find({ isDeleted: { $ne: true } }).exec();
        const products = await Product.find({ isDeleted: { $ne: true } }).exec();

        res.render('offer', {
            offers,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            search,
            brands,
            categories,
            products
        });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const addOffer = async (req, res, next) => {
    try {
        const { offerName, description, discountType, discountAmount, validFrom, validUpto, offerType, applicableTo } = req.body;

        // Validate discountType
        if (discountType !== 'percentage') {
            return res.status(400).json({ success: false, message: 'Invalid discount type! Only percentage offers are supported.' });
        }

        // Validate discountAmount for percentage (0 to 100)
        const discountValue = Number(discountAmount);
        if (isNaN(discountValue) || discountValue <= 0 || discountValue > 100) {
            return res.status(400).json({ success: false, message: 'Discount percentage must be between 0 and 100.' });
        }

        // Check for existing offer with the same name
        function escapeRegex(str) {
            return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        const offerNameRegex = new RegExp(`^${escapeRegex(offerName)}$`, 'i');


        const existingOffer = await Offer.findOne({
            offerName: offerNameRegex
        });

        if (existingOffer) {
            return res.status(400).json({ success: false, message: 'Offer name already exists!' });
        }

        const newOffer = new Offer({
            offerName,
            description,
            discountType,
            discountAmount: discountValue,
            validFrom: new Date(validFrom),
            validUpto: new Date(validUpto),
            offerType,
            applicableTo
        });

        await newOffer.save();
        return res.status(201).json({ success: true, message: 'Offer added successfully!' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const editOffer = async (req, res, next) => {
    try {
        const { offerId, offerName, description, discountType, discountAmount, validFrom, validUpto, offerType, applicableTo } = req.body;
        console.log(req.body)

        // Validate discountType
        if (discountType !== 'percentage') {
            return res.status(400).json({ success: false, message: 'Invalid discount type! Only percentage offers are supported.' });
        }

        // Validate discountAmount for percentage (0 to 100)
        const discountValue = Number(discountAmount);
        if (isNaN(discountValue) || discountValue <= 0 || discountValue > 100) {
            return res.status(400).json({ success: false, message: 'Discount percentage must be between 0 and 100.' });
        }
        // Escape regex special characters
        function escapeRegex(str) {
            return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        // Case-insensitive regex (but still exact match)
        const offerNameRegex = new RegExp(`^${escapeRegex(offerName)}$`, 'i');

        const existingOffer = await Offer.findOne({
            _id: { $ne: new mongoose.Types.ObjectId(offerId) }, // Exclude current offer
            offerName: offerNameRegex                            // Case-insensitive, exact match
        });

        console.log(existingOffer, "existing : ");

        if (existingOffer) {
            return res.status(400).json({ success: false, message: 'Offer name already exists!' });
        }
        const updatedOffer = await Offer.findByIdAndUpdate(offerId, {
            $set: {
                offerName,
                description,
                discountType,
                discountAmount: discountValue,
                validFrom: new Date(validFrom),
                validUpto: new Date(validUpto),
                offerType,
                applicableTo,

            }
        });

        if (!updatedOffer) {
            return res.status(404).json({ success: false, message: 'Offer not found!' });
        }

        return res.status(200).json({ success: true, message: 'Offer updated successfully!' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const deleteOffer = async (req, res, next) => {
    try {
        const id = req.params.id;

        const offer = await Offer.findByIdAndDelete(id);

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found!' });
        }

        return res.status(200).json({ success: true, message: 'Offer deleted successfully' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

module.exports = {
    loadOffers,
    addOffer,
    editOffer,
    deleteOffer
};