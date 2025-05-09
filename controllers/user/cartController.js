const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const mongoose = require('mongoose');

const getCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login?error=Please login to view your cart');
    }

    const userData = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    res.render('cart', {
      user: userData,
      cart: cart || { items: [] },
    });
  } catch (error) {
    console.error("Error loading cart page:", error);
    res.redirect('/pageNotFound');
  }
};

// const addToCart = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     if (!userId) {
//       return res.status(401).json({ success: false, message: "Please log in to add items to the cart" });
//     }

//     const { productId } = req.body;
//     const product = await Product.findById(productId);

//     if (!product) {
//       return res.status(404).json({ success: false, message: "Product not found" });
//     }

//     if (product.quantity <= 0) {
//       return res.status(400).json({ success: false, message: "Product is out of stock" });
//     }

//     let cart = await Cart.findOne({ userId });

//     if (!cart) {
//       cart = new Cart({ userId, items: [] });
//     }

//     const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);

//     if (itemIndex > -1) {
//       cart.items[itemIndex].quantity += 1;
//     } else {
//       cart.items.push({ productId, quantity: 1 });
//     }

//     await cart.save();
//     res.status(200).json({ success: true, message: "Product added to cart successfully" });
//   } catch (error) {
//     console.error("Error adding to cart:", error);
//     res.status(500).json({ success: false, message: "Error adding to cart. Please try again." });
//   }
// };

const addToCart = async (req, res) => {
    try {
      const { productId } = req.body;
      const userId = req.user._id;
  
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ success: false, message: 'Invalid product ID' });
      }
  
      // Fetch the product
      const product = await Product.findById(productId);
      if (!product || !product.isListed || product.quantity <= 0) {
        return res.status(400).json({ success: false, message: 'Product is not available' });
      }
  
      // Find or create cart
      let cart = await Cart.findOne({ userId });
      if (!cart) {
        cart = new Cart({ userId, items: [] });
      }
  
      // Check if product is already in cart
      const itemIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId
      );
  
      if (itemIndex > -1) {
        // Update quantity if item exists (ensure it doesn't exceed stock)
        const newQuantity = cart.items[itemIndex].quantity + 1;
        if (newQuantity > product.quantity || newQuantity > 5) {
          return res.status(400).json({
            success: false,
            message: 'Cannot add more of this item',
          });
        }
        cart.items[itemIndex].quantity = newQuantity;
        cart.items[itemIndex].totalPrice = product.salePrice * newQuantity; // Update totalPrice
      } else {
        // Add new item to cart
        cart.items.push({
          productId,
          quantity: 1,
          price: product.salePrice, // Set price per unit
          totalPrice: product.salePrice, // Set totalPrice for quantity 1
        });
      }
  
      // Save cart
      await cart.save();
  
      res.status(200).json({
        success: true,
        message: 'Product added to cart successfully',
      });
    } catch (error) {
      console.error('Error adding to cart:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

const incrementQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to update cart" });
    }

    const { productId } = req.body;
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(item => item.productId._id.toString() === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    const item = cart.items[itemIndex];
    if (item.quantity >= item.productId.quantity) {
      return res.status(400).json({ success: false, message: "Cannot increment, stock limit reached" });
    }

    if (item.quantity >= 5) {
      return res.status(400).json({ success: false, message: "Cannot increment, maximum quantity per item is 5" });
    }

    item.quantity += 1;
    await cart.save();

    res.status(200).json({ success: true, message: "Quantity incremented successfully" });
  } catch (error) {
    console.error("Error incrementing quantity:", error);
    res.status(500).json({ success: false, message: "Error updating quantity. Please try again." });
  }
};

const decrementQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to update cart" });
    }

    const { productId } = req.body;
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(item => item.productId._id.toString() === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: "Item not found in cart" });
    }

    const item = cart.items[itemIndex];
    if (item.quantity <= 1) {
      return res.status(400).json({ success: false, message: "Cannot decrement, minimum quantity is 1" });
    }

    item.quantity -= 1;
    await cart.save();

    res.status(200).json({ success: true, message: "Quantity decremented successfully" });
  } catch (error) {
    console.error("Error decrementing quantity:", error);
    res.status(500).json({ success: false, message: "Error updating quantity. Please try again." });
  }
};

const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to update cart" });
    }

    const { productId } = req.body;
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    cart.items = cart.items.filter(item => item.productId.toString() !== productId);
    await cart.save();

    res.status(200).json({ success: true, message: "Item removed successfully" });
  } catch (error) {
    console.error("Error removing item:", error);
    res.status(500).json({ success: false, message: "Error removing item. Please try again." });
  }
};

const proceedToCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    let cartItems = [];
    let subtotal = 0;
    let offerDiscount = 0;
    let coupon = 0;
    let total = 0;
    let totalItems = 0;

    cartItems = cart.items.filter(item => {
      const isValid = item.productId &&
                     item.productId._id &&
                     typeof item.productId.salePrice === 'number' &&
                     typeof item.productId.regularPrice === 'number' &&
                     item.productId.isListed &&
                     item.productId.quantity > 0 &&
                     item.quantity <= item.productId.quantity;
      console.log('Filtering item:', { itemId: item._id, isValid, salePrice: item.productId?.salePrice, regularPrice: item.productId?.regularPrice });
      return isValid;
    }).map(item => {
      const salePrice = Number(item.productId.salePrice) || 0;
      const regularPrice = Number(item.productId.regularPrice) || salePrice;
      const quantity = Number(item.quantity) || 1;

      const totalPrice = salePrice * quantity;
      subtotal += totalPrice;
      const itemDiscount = (regularPrice - salePrice) * quantity;
      offerDiscount += itemDiscount;
      totalItems += quantity;

      const mappedItem = {
        productId: item.productId,
        quantity,
        salePrice,
        regularPrice,
        totalPrice,
      };
      console.log('Mapped item:', mappedItem);
      return mappedItem;
    });

    if (cartItems.length !== cart.items.length) {
      cart.items = cartItems;
      await cart.save();
    }

    if (cartItems.length === 0) {
      return res.redirect('/cart');
    }

    total = subtotal;
    if (cart.coupon && Number(cart.coupon.amount)) {
      coupon = Number(cart.coupon.amount) || 0;
      total -= coupon;
    }

    if (total < 0) {
      total = 0;
    }

    console.log('Rendering checkout with values:', {
      cartItems,
      subtotal,
      offerDiscount,
      coupon,
      total,
      totalItems,
      addresses: user.addresses || [],
    });

    res.render('checkout', {
      cartItems,
      subtotal,
      offerDiscount,
      coupon,
      total,
      totalItems,
      addresses: user.addresses || [],
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).send('Server Error');
  }
};

const validateCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to proceed to checkout" });
    }

    let cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Your cart is empty" });
    }

    let cartItems = [];
    let subtotal = 0;
    let offerDiscount = 0;
    let coupon = 0;
    let total = 0;
    let totalItems = 0;

    cartItems = cart.items.filter(item => {
      const isValid = item.productId &&
                     item.productId._id &&
                     typeof item.productId.salePrice === 'number' &&
                     typeof item.productId.regularPrice === 'number' &&
                     item.productId.isListed &&
                     item.productId.quantity > 0 &&
                     item.quantity <= item.productId.quantity;
      return isValid;
    }).map(item => {
      const salePrice = Number(item.productId.salePrice) || 0;
      const regularPrice = Number(item.productId.regularPrice) || salePrice;
      const quantity = Number(item.quantity) || 1;

      const totalPrice = salePrice * quantity;
      subtotal += totalPrice;
      const itemDiscount = (regularPrice - salePrice) * quantity;
      offerDiscount += itemDiscount;
      totalItems += quantity;

      return {
        productId: item.productId._id,
        quantity,
        salePrice,
        regularPrice,
        totalPrice,
      };
    });

    if (cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "No valid items in cart" });
    }

    total = subtotal;
    if (cart.coupon && Number(cart.coupon.amount)) {
      coupon = Number(cart.coupon.amount) || 0;
      total -= coupon;
    }

    if (total < 0) {
      total = 0;
    }

    req.session.checkoutSummary = {
      cartItems,
      subtotal,
      offerDiscount,
      coupon,
      total,
      totalItems,
    };

    res.status(200).json({ success: true, message: "Checkout validated successfully" });
  } catch (error) {
    console.error("Error validating checkout:", error);
    res.status(500).json({ success: false, message: "Error proceeding to checkout. Please try again." });
  }
};

const wishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }

    const userData = await User.findById(userId);
    const wishlist = await Wishlist.findOne({ userId }).populate('products');

    res.render('wishlist', {
      user: userData,
      wishlist: wishlist || { products: [] },
    });
  } catch (error) {
    console.error("Error loading wishlist:", error);
    res.redirect('/pageNotFound');
  }
};

const addWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to add items to the wishlist" });
    }

    const { productId } = req.body;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    let wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      wishlist = new Wishlist({ userId, products: [] });
    }

    if (wishlist.products.includes(productId)) {
      return res.status(400).json({ success: false, message: "Product already in wishlist" });
    }

    wishlist.products.push(productId);
    await wishlist.save();

    res.status(200).json({ success: true, message: "Product added to wishlist successfully" });
  } catch (error) {
    console.error("Error adding to wishlist in cart:", error);
    res.status(500).json({ success: false, message: "Error adding to wishlist in cart. Please try again." });
  }
};

const removeWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to update wishlist" });
    }

    const { productId } = req.body;
    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      return res.status(404).json({ success: false, message: "Wishlist not found" });
    }

    wishlist.products = wishlist.products.filter(product => product.toString() !== productId);
    await wishlist.save();

    res.status(200).json({ success: true, message: "Item removed from wishlist successfully" });
  } catch (error) {
    console.error("Error removing from wishlist:", error);
    res.status(500).json({ success: false, message: "Error removing item from wishlist. Please try again." });
  }
};

module.exports = {
  getCart,
  addToCart,
  incrementQuantity,
  decrementQuantity,
  removeFromCart,
  proceedToCheckout,
  validateCheckout,
  wishlist,
  addWishlist,
  removeWishlist,
};