const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require('../../models/offerSchema');

const productDetailPage = async (req, res, next) => {
    try {
        const productId = req.params.id;
        const userId = req.session.user; // Get userId from session
        const currentDate = new Date();

        // Fetch the product with populated brand and category
        const product = await Product.findById(productId).populate('brand category');
        if (!product) {
            return res.status(404).render('error', { message: 'Product not found' });
        }

        // Fetch Product Offer
        const productOffer = await Offer.findOne({
            offerType: 'Product',
            applicableTo: productId,
            isActive: true,
            validFrom: { $lte: currentDate },
            validUpto: { $gte: currentDate }
        }).lean();

        // Fetch Category Offer
        const categoryOffer = product.category ? await Offer.findOne({
            offerType: 'Category',
            applicableTo: product.category._id,
            isActive: true,
            validFrom: { $lte: currentDate },
            validUpto: { $gte: currentDate }
        }).lean() : null;

        // Determine the largest offer
        let finalOffer = null;
        if (productOffer && categoryOffer) {
            finalOffer = productOffer.discountAmount > categoryOffer.discountAmount ? productOffer : categoryOffer;
        } else if (productOffer) {
            finalOffer = productOffer;
        } else if (categoryOffer) {
            finalOffer = categoryOffer;
        }

        // Calculate discounted price
        const discountedPrice = finalOffer
            ? product.salePrice * (1 - finalOffer.discountAmount / 100)
            : product.salePrice;

        // Fetch related products
        const relatedProducts = await Product.find({
            category: product.category._id,
            _id: { $ne: productId },
            isListed: true,
            isDeleted: false
        })
            .populate('brand')
            .populate('category')
            .limit(4)
            .lean();

        // Fetch wishlist for the user (same as shop controller)
        let wishlist = null;
        if (userId) {
            wishlist = await Wishlist.findOne({ userId }).lean();
        }

        // Check if main product is in wishlist
        const isInWishlist = wishlist
            ? wishlist.products.some(item => item.productId.toString() === productId)
            : false;

        // Add offer data and wishlist status for related products
        const relatedProductsWithOffers = await Promise.all(relatedProducts.map(async (prod) => {
            const prodOffer = await Offer.findOne({
                offerType: 'Product',
                applicableTo: prod._id,
                isActive: true,
                validFrom: { $lte: currentDate },
                validUpto: { $gte: currentDate }
            }).lean();

            const catOffer = prod.category ? await Offer.findOne({
                offerType: 'Category',
                applicableTo: prod.category._id,
                isActive: true,
                validFrom: { $lte: currentDate },
                validUpto: { $gte: currentDate }
            }).lean() : null;

            let prodFinalOffer = null;
            if (prodOffer && catOffer) {
                prodFinalOffer = prodOffer.discountAmount > catOffer.discountAmount ? prodOffer : catOffer;
            } else if (prodOffer) {
                prodFinalOffer = prodOffer;
            } else if (catOffer) {
                prodFinalOffer = catOffer;
            }

            const prodDiscountedPrice = prodFinalOffer
                ? prod.salePrice * (1 - prodFinalOffer.discountAmount / 100)
                : prod.salePrice;

            // Check if this related product is in the wishlist
            const isProductInWishlist = wishlist
                ? wishlist.products.some(item => item.productId.toString() === prod._id.toString())
                : false;

            return {
                ...prod,
                finalOffer: prodFinalOffer,
                discountedPrice: prodDiscountedPrice,
                isInWishlist: isProductInWishlist // Add wishlist status
            };
        }));
console.log(relatedProductsWithOffers)
        // Render the product detail page
        res.render('productDetail', {
            product,
            title: product.productName,
            relatedProducts: relatedProductsWithOffers,
            isInWishlist,
            wishlist: wishlist || { products: [] }, // Consistent with shop controller
            finalOffer,
            discountedPrice,
            findUser: userId ? await User.findById(userId).lean() : null // Add user data like shop controller
        });
    } catch (error) {
        console.error('Error loading product detail page:', error);
        error.statusCode = 500;
        next(error);
    }
};

module.exports = {
    productDetailPage,
};