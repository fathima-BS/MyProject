const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Wishlist = require('../../models/wishlistSchema');

const productDetailPage = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId).populate('brand category');
        console.log(product,'product')
        console.log(productId,'productid')
        if (!product) {
            return res.status(404).render('error', { message: 'Product not found' });
        }
        
        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId },
            isListed: true,
            isDeleted: false
        })
            .populate('brand')
            .limit(4);

        // Check if product is in wishlist
        const wishlist = await Wishlist.findOne({ userId: req.session.user._id });
        const isInWishlist = wishlist ? wishlist.products.some(item => item.productId.toString() === productId) : false;
            
        res.render('productDetail', {
            product,
            title: product.productName,
            relatedProducts,
            isInWishlist
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Server error' });
    }
};

module.exports = {
    productDetailPage,
};