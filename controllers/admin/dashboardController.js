const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');

const getDashboard = async (req, res) => {
    try {
        // Verify collection existence
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Existing collections:', collections.map(c => c.name));

        // Calculate stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfYear = new Date(today.getFullYear(), 0, 1);

        const todaySales = await Order.aggregate([
            { $match: { status: 'Delivered', createdOn: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);
        const yesterdaySales = await Order.aggregate([
            { $match: { status: 'Delivered', createdOn: { $gte: yesterday, $lt: today } } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);
        const monthlySales = await Order.aggregate([
            { $match: { status: 'Delivered', createdOn: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);
        const yearlySales = await Order.aggregate([
            { $match: { status: 'Delivered', createdOn: { $gte: startOfYear } } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);

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

        res.render('dashboard', {
            todaySales: todaySales[0]?.total || 0,
            yesterdaySales: yesterdaySales[0]?.total || 0,
            monthlySales: monthlySales[0]?.total || 0,
            yearlySales: yearlySales[0]?.total || 0,
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
            todaySales: 0,
            yesterdaySales: 0,
            monthlySales: 0,
            yearlySales: 0,
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

        const orderStatus = await Order.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    label: '$_id',
                    count: 1
                }
            }
        ]);

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
            labels: salesData.length,
            sales: salesData.length,
            revenue: salesData.length,
            topProducts: topProducts.length,
            topCategories: topCategories.length,
            topBrands: topBrands.length,
            orderStatus: orderStatus.length
        });

        res.json({
            labels: salesData.map(data => data._id.toString()),
            sales: salesData.map(data => data.totalSales || 0),
            revenue: salesData.map(data => data.totalRevenue || 0),
            topProducts: topProducts || [],
            topCategories: topCategories || [],
            topBrands: topBrands || [],
            orderStatus: {
                labels: orderStatus.map(s => s.label),
                data: orderStatus.map(s => s.count)
            }
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
            topBrands: [],
            orderStatus: { labels: [], data: [] }
        });
    }
};

module.exports = {
    getDashboard,
    getDashboardData
};