const Address = require('../../models/addressSchema');

const loadAddress = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login?error=' + encodeURIComponent('Please log in to view your addresses'));
        }

        const addresses = await Address.findOne({ userId }).lean();
        res.render('address', {
            addresses: addresses || { address: [] }
        });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const addAddress = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to add an address.'
            });
        }
        const { addressType, name, phone, altPhone, landMark, city, state, pincode } = req.body;

        const addressData = {
            addressType,
            name,
            phone,
            altPhone: altPhone || undefined,
            landMark,
            city,
            State: state,
            pincode: Number(pincode)
        };

        let addressDoc = await Address.findOne({ userId });
        if (addressDoc) {
            addressDoc.address.push(addressData);
            await addressDoc.save();
        } else {
            addressDoc = new Address({
                userId,
                address: [addressData]
            });
            await addressDoc.save();
        }

        res.json({
            success: true,
            message: 'Address added successfully.'
        });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const editAddress = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to edit an address.'
            });
        }
        const { addressId, addressType, name, phone, altPhone, landMark, city, state, pincode } = req.body;
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({
                success: false,
                message: 'Address not found.'
            });
        }

        const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Address not found.'
            });
        }

        addressDoc.address[addressIndex] = {
            _id: addressDoc.address[addressIndex]._id,
            addressType,
            name,
            phone,
            altPhone: altPhone || undefined,
            landMark,
            city,
            State: state,
            pincode: Number(pincode)
        };

        await addressDoc.save();

        res.json({
            success: true,
            message: 'Address updated successfully.'
        });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const deleteAddress = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to delete an address.'
            });
        }

        const { id: addressId } = req.query;
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({
                success: false,
                message: 'Address not found.'
            });
        }

        const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Address not found.'
            });
        }

        addressDoc.address.splice(addressIndex, 1);
        await addressDoc.save();

        res.json({
            success: true,
            message: 'Address deleted successfully.'
        });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const deliverAddress = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to set a delivery address.'
            });
        }

        const { addressId } = req.body;
        const addressDoc = await Address.findOne({ userId });
        if (!addressDoc) {
            return res.status(404).json({
                success: false,
                message: 'Address not found.'
            });
        }

        const addressIndex = addressDoc.address.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Address not found.'
            });
        }

        const [selectedAddress] = addressDoc.address.splice(addressIndex, 1);
        addressDoc.address.unshift(selectedAddress);
        await addressDoc.save();

        res.json({
            success: true,
            message: 'Delivery address set successfully.'
        });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

module.exports = {
    loadAddress,
    addAddress,
    editAddress,
    deleteAddress,
    deliverAddress
};