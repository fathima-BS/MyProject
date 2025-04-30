
const Product = require('../../models/productSchema')



const productDetailPage = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId).populate('brand category');
    
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
      .limit(4); // Limit to 4 related products
    res.render('productDetail', {
      product,
      title: product.productName,
      relatedProducts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { message: 'Server error' });
  }
};


module.exports={
    productDetailPage
}