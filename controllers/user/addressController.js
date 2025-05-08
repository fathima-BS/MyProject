const User = require('../../models/userSchema');

const Address = require('../../models/addressSchema'); // Adjust path based on your project structure

const loadAddress = async (req, res) => {
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
        console.error('Error loading address page:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while loading your addresses. Please try again.'
        });
    }
};

const addAddress = async (req, res) => {
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
            State:state,
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

        if (addressDoc.address.length === 1) {
            await User.findByIdAndUpdate(userId, { phone });
        }

        res.json({
            success: true,
            message: 'Address added successfully.'
        });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while adding the address.'
        });
    }
};

const editAddress = async (req, res) => {
    try {
        console.log('hidsafdsaf')
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please log in to edit an address.'
            });
        }
       console.log(req.body)
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
            State:state,
            pincode: Number(pincode)
        };

        await addressDoc.save();

        if (addressIndex === 0) {
            await User.findByIdAndUpdate(userId, { phone });
        }

        res.json({
            success: true,
            message: 'Address updated successfully.'
        });
    } catch (error) {
        console.error('Error editing address:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while updating the address.'
        });
    }
};

const deleteAddress = async (req, res) => {
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

        if (addressIndex === 0 && addressDoc.address.length > 0) {
            await User.findByIdAndUpdate(userId, { phone: addressDoc.address[0].phone });
        } else if (addressDoc.address.length === 0) {
            await User.findByIdAndUpdate(userId, { phone: undefined });
        }

        res.json({
            success: true,
            message: 'Address deleted successfully.'
        });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while deleting the address.'
        });
    }
};

const deliverAddress = async (req, res) => {
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

        await User.findByIdAndUpdate(userId, { phone: selectedAddress.phone });

        res.json({
            success: true,
            message: 'Delivery address set successfully.'
        });
    } catch (error) {
        console.error('Error setting delivery address:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while setting the delivery address.'
        });
    }
};

// Export all functions
module.exports = {
    loadAddress,
    addAddress,
    editAddress,
    deleteAddress,
    deliverAddress
};