const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const getDashboard = async (req, res) => {
    console.log("hi")
  try {
    // Verify collection names
    console.log('Collection names:', {
      orders: Order.collection.name,
      products: Product.collection.name,
      categories: Category.collection.name,
      brands: Brand.collection.name
    });

    // Verify collection existence
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log('Existing collections:', collectionNames);

    const topProducts = await Order.aggregate([
      { $unwind: '$orderedItems' },
      { $match: { status: 'Delivered' } },
      {
        $group: {
          _id: '$orderedItems.product',
          totalQuantity: { $sum: '$orderedItems.quantity' },
          totalRevenue: { $sum: { $multiply: ['$orderedItems.quantity', '$orderedItems.price'] } }
        }
      },
      {
        $lookup: {
          from: Product.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          productName: { $ifNull: ['$product.productName', 'Unknown Product'] },
          totalQuantity: 1,
          totalRevenue: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    const topCategories = await Order.aggregate([
      { $unwind: '$orderedItems' },
      { $match: { status: 'Delivered' } },
      {
        $lookup: {
          from: Product.collection.name,
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.category',
          totalQuantity: { $sum: '$orderedItems.quantity' }
        }
      },
      {
        $lookup: {
          from: Category.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ['$category.name', 'Unknown Category'] },
          totalQuantity: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    const topBrands = await Order.aggregate([
      { $unwind: '$orderedItems' },
      { $match: { status: 'Delivered' } },
      {
        $lookup: {
          from: Product.collection.name,
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.brand',
          totalQuantity: { $sum: '$orderedItems.quantity' }
        }
      },
      {
        $lookup: {
          from: Brand.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'brand'
        }
      },
      { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          BrandName: { $ifNull: ['$brand.BrandName', 'Unknown Brand'] },
          totalQuantity: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);
     console.log(topProducts,'produces is here ')
    console.log('Aggregation results:', {
      topProducts: topProducts.length,
      topCategories: topCategories.length,
      topBrands: topBrands.length
    });

    res.render('dashboard', {
      topProducts: topProducts || [],
      topCategories: topCategories || [],
      topBrands: topBrands || [],
      error: null
    });
  } catch (error) {
    console.error('Error in getDashboard:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name
    });
    res.render('dashboard', {
      topProducts: [],
      topCategories: [],
      topBrands: [],
      error: 'Failed to load dashboard data: ' + error.message
    });
  }
};

const getDashboardData = async (req, res) => {
  try {
    console.log('getDashboardData called with filter:', req.query.filter);
    const filter = req.query.filter || 'daily';
    let groupBy, dateFormat;

    switch (filter) {
      case 'yearly':
        groupBy = { $year: '$createdOn' };
        dateFormat = '$year';
        break;
      case 'monthly':
        groupBy = { $month: '$createdOn' };
        dateFormat = '$month';
        break;
      case 'weekly':
        groupBy = { $week: '$createdOn' };
        dateFormat = '$week';
        break;
      default:
        groupBy = { $dayOfYear: '$createdOn' };
        dateFormat = '$dayOfYear';
    }

    const salesData = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      {
        $group: {
          _id: groupBy,
          totalSales: { $sum: { $sum: '$orderedItems.quantity' } },
          totalRevenue: { $sum: '$finalAmount' }
        }
      },
      {
        $project: {
          label: dateFormat,
          totalSales: 1,
          totalRevenue: 1
        }
      },
      { $sort: { _id: 1 } }
    ]);

    console.log('Sales data:', salesData);

    const labels = salesData.map(data => data._id.toString());
    const sales = salesData.map(data => data.totalSales || 0);
    const revenue = salesData.map(data => data.totalRevenue || 0);

    const topProducts = await Order.aggregate([
      { $unwind: '$orderedItems' },
      { $match: { status: 'Delivered' } },
      {
        $group: {
          _id: '$orderedItems.product',
          totalQuantity: { $sum: '$orderedItems.quantity' },
          totalRevenue: { $sum: { $multiply: ['$orderedItems.quantity', '$orderedItems.price'] } }
        }
      },
      {
        $lookup: {
          from: Product.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          productName: { $ifNull: ['$product.productName', 'Unknown Product'] },
          totalQuantity: 1,
          totalRevenue: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    const topCategories = await Order.aggregate([
      { $unwind: '$orderedItems' },
      { $match: { status: 'Delivered' } },
      {
        $lookup: {
          from: Product.collection.name,
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.category',
          totalQuantity: { $sum: '$orderedItems.quantity' }
        }
      },
      {
        $lookup: {
          from: Category.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ['$category.name', 'Unknown Category'] },
          totalQuantity: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    const topBrands = await Order.aggregate([
      { $unwind: '$orderedItems' },
      { $match: { status: 'Delivered' } },
      {
        $lookup: {
          from: Product.collection.name,
          localField: 'orderedItems.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.brand',
          totalQuantity: { $sum: '$orderedItems.quantity' }
        }
      },
      {
        $lookup: {
          from: Brand.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'brand'
        }
      },
      { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          BrandName: { $ifNull: ['$brand.BrandName', 'Unknown Brand'] },
          totalQuantity: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    console.log('getDashboardData results:', {
      labels: labels.length,
      sales: sales.length,
      revenue: revenue.length,
      topProducts: topProducts.length,
      topCategories: topCategories.length,
      topBrands: topBrands.length
    });

    res.json({
      labels: labels || [],
      sales: sales || [],
      revenue: revenue || [],
      topProducts: topProducts || [],
      topCategories: topCategories || [],
      topBrands: topBrands || []
    });
  } catch (error) {
    console.error('Error in getDashboardData:', error.message, error.stack);
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      labels: [],
      sales: [],
      revenue: [],
      topProducts: [],
      topCategories: [],
      topBrands: []
    });
  }
};



const getLedger = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { status: 'Delivered' };
    if (startDate && endDate) {
      query.createdOn = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const orders = await Order.find(query).populate({
      path: 'orderedItems.product',
      select: 'productName'
    }).lean();

    console.log('Ledger orders:', orders.length);

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=ledger.pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Order Ledger', { align: 'center' });
    doc.moveDown();

    orders.forEach(order => {
      doc.fontSize(12).text(`Order ID: ${order.orderId || 'N/A'}`);
      doc.text(`Date: ${new Date(order.createdOn).toLocaleDateString()}`);
      doc.text(`Total Amount: ${order.finalAmount || 0}`);
      doc.text('Items:');
      order.orderedItems.forEach(item => {
        doc.text(`- ${item.product?.productName || 'Unknown Product'} (Qty: ${item.quantity}, Price: ${item.price})`);
      });
      doc.moveDown();
    });

    doc.end();
  } catch (error) {
    console.error('Error in getLedger:', error.message, error.stack);
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getDashboard,
  getDashboardData,
  getLedger
};