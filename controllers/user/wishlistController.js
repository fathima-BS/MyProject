const Product = require('../../models/productSchema');
const Wishlist=require('../../models/wishlistSchema')
const mongoose = require('mongoose');

const wishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).render('login', { message: 'Please log in to view your wishlist' });
        }

        const wishlist = await Wishlist.findOne({ userId })
            .populate({
                path: 'products.productId',
                populate: { path: 'brand' },
            })
            .lean();

        const wishlistItems = wishlist ? wishlist.products.map(item => item.productId) : [];
        const message = req.query.message || '';

        res.render('wishlist', { wishlistItems, message });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).render('page404', { message: 'Server error' });
    }
};
const addToWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please log in to add items to the wishlist' });
        }

        const { productId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const product = await Product.findById(productId).populate('category');
        if (!product || !product.isListed || product.category?.isBlocked) {
            return res.status(400).json({ success: false, message: 'Product is not available' });
        }

        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, products: [] });
        }

        if (wishlist.products.some(item => item.productId.toString() === productId)) {
            return res.status(400).json({
                success: false,
                message: `Product ${product.productName} is already in your wishlist`,
            });
        }

        wishlist.products.push({ productId });
        await wishlist.save();

        res.status(200).json({ success: true, message: 'Product added to wishlist successfully' });
    } catch (error) {
        console.error('Error adding to wishlist in user:', error);
        res.status(500).json({ success: false, message: 'Error adding to wishlist in user' });
    }
};

const removeWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please log in to update wishlist' });
        }

        const { productId } = req.body;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID' });
        }

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({ success: false, message: 'Wishlist not found' });
        }

        wishlist.products = wishlist.products.filter(item => item.productId.toString() !== productId);
        await wishlist.save();

        res.status(200).json({ success: true, message: 'Product removed from wishlist' });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({ success: false, message: 'Error removing from wishlist' });
    }
};

module.exports = {
    wishlist,
    addToWishlist,
    removeWishlist
}