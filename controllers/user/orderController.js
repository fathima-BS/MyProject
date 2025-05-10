const Order = require('../../models/orderSchema');

const getMyOrders = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect('/login');
    }

    const filter = req.query.filter || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const months = req.query.months ? parseInt(req.query.months) : 3;

    let statusFilter = {};
    if (filter !== 'all') {
      statusFilter.status = filter;
    }
    if (months !== 'all') {
      const dateFilter = new Date();
      dateFilter.setMonth(dateFilter.getMonth() - months);
      statusFilter.createdOn = { $gte: dateFilter };
    }

    const skip = (page - 1) * limit;

    const orders = await Order.find({
      address: req.user._id,
      ...statusFilter,
    })
      .populate('orderedItems.product')
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments({
      address: req.user._id,
      ...statusFilter,
    });

    const totalPages = Math.ceil(totalOrders / limit);

    res.render('order', {
      orders,
      filter,
      currentPage: page,
      totalPages,
      months,
      user: req.user,
    });
  } catch (error) {
    console.error('Error loading orders:', error.message, error.stack);
    res.status(500).render('error', { message: 'Something went wrong while fetching orders.' });
  }
};

const orderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    
    const statusFilter = {}; 
    const skip = 0; 
    const limit = 10;

    const order = await Order.findOne({
      address: req.user._id,
      ...statusFilter,
    })
      .populate('orderedItems.product')
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await Order.countDocuments({
      address: req.user._id,
      ...statusFilter,
    });

    res.render('order-details', { 
      orderId,
      totalOrders,
      order
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Something went wrong');
  }
};



module.exports = {
  getMyOrders,
  orderDetails
};