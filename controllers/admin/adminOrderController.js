const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/couponSchema')
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');


const ITEMS_PER_PAGE = 10;

// List Orders with Search, Sort, Filter, and Pagination
const listOrders = async (req, res) => {
  try {
    const { page = 1, search = '', status = 'all', months = 'all', sortBy = 'createdOn' } = req.query;
    let query = {};

    if (search) {
      const users = await User.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
        ],
      });
      const userIds = users.map(user => user._id);
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { userId: { $in: userIds } },
      ];
    }

    if (status !== 'all') {
      query.status = status;
    }

    if (months !== 'all') {
      const dateThreshold = new Date();
      dateThreshold.setMonth(dateThreshold.getMonth() - parseInt(months));
      query.createdOn = { $gte: dateThreshold };
    }

    const sortOptions = {};
    if (sortBy === 'orderId') {
      sortOptions.orderId = 1; // Ascending
    } else if (sortBy === 'finalAmount') {
      sortOptions.finalAmount = -1; // Descending
    } else {
      sortOptions.createdOn = -1; // Default: sort by date descending
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / ITEMS_PER_PAGE);
    const currentPage = parseInt(page) || 1;

    const orders = await Order.find(query)
      .populate('userId')
      .populate('orderedItems.product')
      .sort(sortOptions)
      .skip((currentPage - 1) * ITEMS_PER_PAGE)
      .limit(ITEMS_PER_PAGE);

    res.render('orderAdmin', {
      orders,
      currentPage,
      totalPages,
      search,
      status,
      months,
      sortBy,
    });
  } catch (error) {
    console.error('Error listing orders:', error);
    res.status(500).send('Server Error');
  }
};

// Get Order Details for Admin
const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findOne({ orderId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).render('/page404', { message: 'Order not found.' });
    }

    res.render('orderDetailsAdmin', { order });
  } catch (error) {
    console.error('Error fetching order details:', error.message, error.stack);
    res.status(500).render('page404', { message: 'Something went wrong while fetching order details.' });
  }
};

// Update Order Status
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    order.status = status;
    order.orderedItems.forEach(item => {
      if (item.status !== 'Cancelled' && item.status !== 'Returned' && item.status !== 'Return Rejected') {
        item.status = status;
      }
    });

    await order.save();
    res.status(200).json({ success: true, message: 'Order status updated successfully.' });
  } catch (error) {
    console.error('Error updating order status:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Something went wrong while updating the order status.' });
  }
};

// Handle Return Request (Accept/Reject)
const handleReturnRequest = async (req, res) => {
  try {
    const { orderId, productId, action, rejectReason } = req.query;

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const item = order.orderedItems.find(item => item.product.toString() === productId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in order.' });
    }

    if (item.status !== 'Return Request') {
      return res.status(400).json({ success: false, message: 'No return request found for this item.' });
    }

    if (action === 'accept') {
      item.status = 'Returned';
      const refundAmount = item.price * item.quantity;

      // Update wallet
      let wallet = await Wallet.findOne({ userId: order.userId });
      if (!wallet) {
        wallet = new Wallet({
          userId: order.userId,
          balance: 0,
          transactions: [],
        });
      }

      wallet.balance += refundAmount;
      wallet.transactions.push({
        amount: refundAmount,
        type: 'credit',
        description: `Refund for returned item in order #${orderId}`,
        date: new Date(),
      });

      await wallet.save();
    } else if (action === 'reject') {
      item.status = 'Return Rejected';
      item.returnRejectReason = rejectReason || 'Not specified';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action.' });
    }

    const allItemsProcessed = order.orderedItems.every(item =>
      ['Delivered', 'Cancelled', 'Returned', 'Return Rejected'].includes(item.status)
    );
    if (allItemsProcessed) {
      if (order.orderedItems.some(item => item.status === 'Return Rejected')) {
        order.status = 'Return Rejected';
        order.returnRejectReason = rejectReason || 'Not specified';
      } else if (order.orderedItems.every(item => item.status === 'Returned' || item.status === 'Cancelled')) {
        order.status = 'Returned';
      } else {
        order.status = 'Delivered';
      }
    }

    await order.save();
    res.status(200).json({ success: true, message: `Return request ${action}ed successfully.` });
  } catch (error) {
    console.error('Error handling return request:', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Something went wrong while processing the return request.' });
  }
};

const getSalesReport = async (req, res) => {
  try {
    const { filter = 'daily', startDate, endDate, page = 1 } = req.query;
    let query = {status:"Delivered"}; // Include all order statuses
    let dateFilter = {};

    // Calculate date range based on filter
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filter === 'daily') {
      dateFilter = {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
    } else if (filter === 'weekly') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday as start
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      dateFilter = {
        $gte: startOfWeek,
        $lt: endOfWeek,
      };
    } else if (filter === 'monthly') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      dateFilter = {
        $gte: startOfMonth,
        $lt: endOfMonth,
      };
    } else if (filter === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = {
        $gte: start,
        $lte: end,
      };
    }

    if (Object.keys(dateFilter).length > 0) {
      query.createdOn = dateFilter;
    }

    // Pagination
    const itemsPerPage = 10;
    const currentPage = parseInt(page) || 1;

    // Fetch orders
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / itemsPerPage);

    const orders = await Order.find(query)
      .populate('userId', 'username')
      .populate('orderedItems.product')
      .sort({ createdOn: -1 })
      .skip((currentPage - 1) * itemsPerPage)
      .limit(itemsPerPage);

    // Calculate totals and add coupon data to the paginated orders
    let totalSalesCount = totalOrders;
    let totalOrderAmount = 0;
    let totalDiscount = 0;

    const allOrders = await Order.find(query);
    for (const order of allOrders) {
      totalOrderAmount += order.finalAmount || 0;
      totalDiscount += order.discount || 0;
    }

    // Add coupon data and compute offerDiscount for the paginated orders
    for (const order of orders) {
      if (order.couponCode) {
        const coupon = await Coupon.findOne({ couponCode: order.couponCode });
        order.couponDiscount = coupon ? coupon.offerPrice : 0;
        order.couponCodeDisplay = coupon ? coupon.couponCode : 'Unknown';
      } else {
        order.couponDiscount = 0;
        order.couponCodeDisplay = null;
      }
      // Compute offerDiscount (total discount minus coupon discount)
      order.offerDiscount = (order.discount || 0) - (order.couponDiscount || 0);
    }


    res.render('salesReport', {
      orders,
      totalSalesCount,
      totalOrderAmount,
      totalDiscount,
      filter,
      startDate,
      endDate,
      currentPage,
      totalPages,
    });
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).render('dashboard', { message: 'Something went wrong while fetching the sales report.' });
  }
};

const downloadSalesReportPDF = async (req, res) => {
  try {
    const { filter = 'daily', startDate, endDate } = req.query;
    let query = {status:"Delivered"};
    let dateFilter = {};

    // Calculate date range based on filter (same logic as getSalesReport)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filter === 'daily') {
      dateFilter = {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
    } else if (filter === 'weekly') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      dateFilter = {
        $gte: startOfWeek,
        $lt: endOfWeek,
      };
    } else if (filter === 'monthly') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      dateFilter = {
        $gte: startOfMonth,
        $lt: endOfMonth,
      };
    } else if (filter === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = {
        $gte: start,
        $lte: end,
      };
    }

    if (Object.keys(dateFilter).length > 0) {
      query.createdOn = dateFilter;
    }

    // Fetch all orders (no pagination for PDF)
    const orders = await Order.find(query)
      .populate('userId', 'username')
      .populate('orderedItems.product')
      .sort({ createdOn: -1 });

    // Calculate totals
    let totalSalesCount = orders.length;
    let totalOrderAmount = 0;
    let totalDiscount = 0;

    for (const order of orders) {
      totalOrderAmount += order.finalAmount || 0;
      totalDiscount += order.discount || 0;
      // Add coupon data and compute offerDiscount
      if (order.couponCode) {
        const coupon = await Coupon.findOne({ couponCode: order.couponCode });
        order.couponDiscount = coupon ? coupon.offerPrice : 0;
        order.couponCodeDisplay = coupon ? coupon.couponCode : 'Unknown';
      } else {
        order.couponDiscount = 0;
        order.couponCodeDisplay = null;
      }
      order.offerDiscount = (order.discount || 0) - (order.couponDiscount || 0);
    }

    // Create a new PDF document
    const doc = new PDFDocument({ margin: 50 });
    const filename = `Sales_Report_${new Date().toISOString().split('T')[0]}.pdf`;

    // Set response headers for download
    res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-type', 'application/pdf');

    // Pipe the PDF to the response
    doc.pipe(res);

    // Use Times-Roman font
    doc.font('Times-Roman');

    // Add title
    doc.fontSize(20).text('Sales Report', { align: 'center' });
    doc.moveDown(1.5);

    // Add date range information
    let dateRangeText = '';
    if (filter === 'daily') {
      dateRangeText = `Daily Report: ${today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    } else if (filter === 'weekly') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      dateRangeText = `Weekly Report: ${startOfWeek.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    } else if (filter === 'monthly') {
      dateRangeText = `Monthly Report: ${today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
    } else if (filter === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      dateRangeText = `Custom Report: ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} - ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }
    doc.fontSize(12).text(dateRangeText, { align: 'center' });
    doc.moveDown(2);

    // Add summary data
    doc.fontSize(14).text('Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Total Sales Count: ${totalSalesCount}`);
    doc.text(`Total Order Amount: Rs. ${totalOrderAmount.toLocaleString('en-IN')}`);
    doc.text(`Total Discount: Rs. ${totalDiscount.toLocaleString('en-IN')}`);
    doc.moveDown(2);

    // Define table layout
    const colWidths = [50, 90, 70, 50, 50, 60, 50, 50, 40]; // Adjusted to fit page width
    const headers = [
      'Date',
      'Order ID',
      'Customer',
      'Amount',
      'Offer Discount',
      'Coupon',
      'Coupon Discount',
      'Final Amount',
      'Status'
    ];
    const tableTop = doc.y;
    const tableLeft = 50;
    const tableRight = tableLeft + colWidths.reduce((sum, width) => sum + width, 0); // 490 points
    const rowHeight = 30;

    // Draw table borders - top line
    doc.moveTo(tableLeft, tableTop).lineTo(tableRight, tableTop).stroke();

    // Draw vertical lines for columns
    let xPos = tableLeft;
    for (let i = 0; i <= headers.length; i++) {
      doc.moveTo(xPos, tableTop).lineTo(xPos, tableTop + rowHeight * (orders.length + 1)).stroke();
      if (i < headers.length) xPos += colWidths[i];
    }

    // Draw header row
    xPos = tableLeft;
    doc.fontSize(9).font('Times-Roman').fillColor('black'); // Reduced font size
    headers.forEach((header, i) => {
      doc.text(header, xPos + 2, tableTop + 5, { width: colWidths[i] - 4, align: 'left', height: rowHeight });
      xPos += colWidths[i];
    });

    // Draw header bottom line
    doc.moveTo(tableLeft, tableTop + rowHeight).lineTo(tableRight, tableTop + rowHeight).stroke();

    // Add table rows
    let yPos = tableTop + rowHeight;
    orders.forEach((order) => {
      xPos = tableLeft;
      const rowData = [
        new Date(order.createdOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        order.orderId,
        order.userId ? order.userId.username : 'Unknown',
        `Rs. ${((order.totalPrice || 0) + (order.shippingCost || 0)).toLocaleString('en-IN')}`,
        `Rs. ${(order.offerDiscount || 0).toLocaleString('en-IN')}`,
        order.couponCodeDisplay || 'None',
        `Rs. ${(order.couponDiscount || 0).toLocaleString('en-IN')}`,
        `Rs. ${(order.finalAmount || 0).toLocaleString('en-IN')}`,
        order.status
      ];

      rowData.forEach((data, i) => {
        doc.text(data, xPos + 2, yPos + 5, { width: colWidths[i] - 4, align: 'left', height: rowHeight });
        xPos += colWidths[i];
      });

      yPos += rowHeight;
      // Draw row bottom line
      doc.moveTo(tableLeft, yPos).lineTo(tableRight, yPos).stroke();

      // Check for page overflow and add new page if needed
      if (yPos > 650) {
        doc.addPage();
        yPos = 50;
        xPos = tableLeft;
        doc.font('Times-Roman').fillColor('black');
        // Redraw table borders and headers on new page
        doc.moveTo(tableLeft, yPos).lineTo(tableRight, yPos).stroke();
        let tempX = tableLeft;
        for (let i = 0; i <= headers.length; i++) {
          doc.moveTo(tempX, yPos).lineTo(tempX, yPos + rowHeight * (orders.length + 1)).stroke();
          if (i < headers.length) tempX += colWidths[i];
        }
        tempX = tableLeft;
        headers.forEach((header, i) => {
          doc.text(header, tempX + 2, yPos + 5, { width: colWidths[i] - 4, align: 'left', height: rowHeight });
          tempX += colWidths[i];
        });
        doc.moveTo(tableLeft, yPos + rowHeight).lineTo(tableRight, yPos + rowHeight).stroke();
        yPos += rowHeight;
        doc.font('Times-Roman');
      }
    });

    // Finalize the PDF and end the stream
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Error generating PDF');
  }
};

const downloadSalesReportExcel = async (req, res) => {
  try {
    const { filter = 'daily', startDate, endDate } = req.query;
    let query = {status:"Delivered"};
    let dateFilter = {};

    // Calculate date range based on filter (same logic as getSalesReport)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (filter === 'daily') {
      dateFilter = {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
    } else if (filter === 'weekly') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      dateFilter = {
        $gte: startOfWeek,
        $lt: endOfWeek,
      };
    } else if (filter === 'monthly') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      dateFilter = {
        $gte: startOfMonth,
        $lt: endOfMonth,
      };
    } else if (filter === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = {
        $gte: start,
        $lte: end,
      };
    }

    if (Object.keys(dateFilter).length > 0) {
      query.createdOn = dateFilter;
    }

    // Fetch all orders (no pagination for Excel)
    const orders = await Order.find(query)
      .populate('userId', 'username')
      .populate('orderedItems.product')
      .sort({ createdOn: -1 });

    // Calculate totals
    let totalSalesCount = orders.length;
    let totalOrderAmount = 0;
    let totalDiscount = 0;

    for (const order of orders) {
      totalOrderAmount += order.finalAmount || 0;
      totalDiscount += order.discount || 0;
      // Add coupon data and compute offerDiscount
      if (order.couponCode) {
        const coupon = await Coupon.findOne({ couponCode: order.couponCode });
        order.couponDiscount = coupon ? coupon.offerPrice : 0;
        order.couponCodeDisplay = coupon ? coupon.couponCode : 'Unknown';
      } else {
        order.couponDiscount = 0;
        order.couponCodeDisplay = null;
      }
      order.offerDiscount = (order.discount || 0) - (order.couponDiscount || 0);
    }

    // Create a new Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Define columns
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Order ID', key: 'orderId', width: 25 },
      { header: 'Customer', key: 'customer', width: 20 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Offer Discount', key: 'offerDiscount', width: 15 },
      { header: 'Coupon', key: 'coupon', width: 15 },
      { header: 'Coupon Discount', key: 'couponDiscount', width: 15 },
      { header: 'Final Amount', key: 'finalAmount', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    // Add summary data at the top
    worksheet.addRow(['Sales Report']).font = { size: 16, bold: true };
    worksheet.addRow([]); // Empty row for spacing

    let dateRangeText = '';
    if (filter === 'daily') {
      dateRangeText = `Daily Report: ${today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    } else if (filter === 'weekly') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      dateRangeText = `Weekly Report: ${startOfWeek.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    } else if (filter === 'monthly') {
      dateRangeText = `Monthly Report: ${today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
    } else if (filter === 'custom' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      dateRangeText = `Custom Report: ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} - ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }
    worksheet.addRow([dateRangeText]).font = { size: 12 };

    worksheet.addRow([]); // Empty row for spacing
    worksheet.addRow(['Summary']).font = { size: 14, bold: true };
    worksheet.addRow(['Total Sales Count', totalSalesCount]);
    worksheet.addRow(['Total Order Amount', `Rs. ${totalOrderAmount.toLocaleString('en-IN')}`]);
    worksheet.addRow(['Total Discount', `Rs. ${totalDiscount.toLocaleString('en-IN')}`]);
    worksheet.addRow([]); // Empty row for spacing

    // Add table headers (already defined in worksheet.columns, but we can style them)
    const headerRow = worksheet.getRow(10); // Headers are at row 10 after summary
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'D3D3D3' }, // Light gray background
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Add table rows
    orders.forEach((order) => {
      worksheet.addRow({
        date: new Date(order.createdOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        orderId: order.orderId,
        customer: order.userId ? order.userId.username : 'Unknown',
        amount: `Rs. ${((order.totalPrice || 0) + (order.shippingCost || 0)).toLocaleString('en-IN')}`,
        offerDiscount: `Rs. ${(order.offerDiscount || 0).toLocaleString('en-IN')}`,
        coupon: order.couponCodeDisplay || 'None',
        couponDiscount: `Rs. ${(order.couponDiscount || 0).toLocaleString('en-IN')}`,
        finalAmount: `Rs. ${(order.finalAmount || 0).toLocaleString('en-IN')}`,
        status: order.status,
      });
    });

    // Add borders to data rows
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber >= 10) { // Start from header row
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      }
    });

    // Set response headers for download
    const filename = `Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Write the Excel file to the response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating Excel:', error);
    res.status(500).send('Error generating Excel');
  }
};

module.exports = {
  listOrders,
  getOrderDetails,
  updateOrderStatus,
  handleReturnRequest,
  getSalesReport,
  downloadSalesReportPDF,
  downloadSalesReportExcel,
};