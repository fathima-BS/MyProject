const Brand = require('../../models/brandSchema');

const loadBrand = async (req, res) => {
    try {
        let search = '';
        if (req.query.search) {
            search = req.query.search.trim();
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 3;

        const brand = await Brand.find({
            isDeleted: false,
            BrandName: { $regex: search, $options: 'i' }
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await Brand.countDocuments({
            isDeleted: false,
            BrandName: { $regex: search, $options: 'i' }
        });

        res.render('brand', {
            brand,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            search
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Something went wrong while loading brands' });
    }
};

const addBrand = async (req, res) => {
    try {
        const { BrandName, description } = req.body;

        const existingBrand = await Brand.findOne({ BrandName: { $regex: new RegExp("^" + BrandName + "$", "i") } });

        if (existingBrand) {
            return res.json({ success: false, message: 'Brand already exists!' });
        }

        const newBrand = new Brand({
            BrandName,
            description
        });

        await newBrand.save();

        return res.json({ success: true, message: 'Brand added successfully!' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const editBrand = async (req, res) => {
    try {
        const { brandId, BrandName, description } = req.body;

        const existingBrand = await Brand.findOne({
            _id: { $ne: brandId },
            BrandName: { $regex: new RegExp("^" + BrandName + "$", "i") }
        });

        if (existingBrand) {
            return res.json({ success: false, message: 'Brand already exists!' });
        }

        const updatedBrand = await Brand.findByIdAndUpdate(brandId, { $set: { BrandName, description } });

        if (!updatedBrand) {
            return res.json({ success: false, message: 'Brand not found!' });
        }

        return res.json({ success: true, message: 'Brand updated successfully!' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const deleteBrand = async (req, res) => {
    try {
        const id = req.params.id;

        const brand = await Brand.findByIdAndUpdate(id, { $set: { isDeleted: true } });

        if (!brand) {
            return res.json({ success: false, message: 'Brand not found!' });
        }

        return res.json({ success: true, message: 'Brand deleted successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const unlistBrand = async (req, res) => {
    try {
        const id = req.params.id;

        const brand = await Brand.findByIdAndUpdate(id, { $set: { isListed: false } });

        if (!brand) {
            return res.json({ success: false, message: 'Brand not found!' });
        }

        return res.json({ success: true, message: 'Brand unlisted' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const listBrand = async (req, res) => {
    try {
        const id = req.params.id;

        const brand = await Brand.findByIdAndUpdate(id, { $set: { isListed: true } });

        if (!brand) {
            return res.json({ success: false, message: 'Brand not found!' });
        }

        return res.json({ success: true, message: 'Brand listed' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    loadBrand,
    addBrand,
    editBrand,
    unlistBrand,
    listBrand,
    deleteBrand
};