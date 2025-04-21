const Category = require('../../models/categorySchema');

const LoadCategory = async (req, res) => {
    try {
        let search = '';
        if (req.query.search) {
            search = req.query.search.trim();
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 3;

        const category = await Category.find({
            isDeleted: false,
            name: { $regex: search, $options: 'i' }
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await Category.countDocuments({
            isDeleted: false,
            name: { $regex: search, $options: 'i' }
        });

        res.render('category', {
            category,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            search
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { message: 'Something went wrong while loading categories' });
    }
};

const addCategory = async (req, res) => {
    try {
        const { categoryName, description, categoryOffer } = req.body;

        const existingCategory = await Category.findOne({ name: { $regex: new RegExp("^" + categoryName + "$", "i") } });

        if (existingCategory) {
            return res.json({ success: false, message: 'Category already exists!' });
        }

        const newCategory = new Category({
            name: categoryName,
            description,
            categoryOffer
        });

        await newCategory.save();

        return res.json({ success: true, message: 'Category added successfully!' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const editCategory = async (req, res) => {
    try {
        const { categoryId, categoryName, description, categoryOffer } = req.body;

        const existingCategory = await Category.findOne({
            _id: { $ne: categoryId },
            name: { $regex: new RegExp("^" + categoryName + "$", "i") }
        });

        if (existingCategory) {
            return res.json({ success: false, message: 'Category already exists!' });
        }

        const updatedCategory = await Category.findByIdAndUpdate(categoryId, { $set: { name: categoryName, description, categoryOffer } });

        if (!updatedCategory) {
            return res.json({ success: false, message: 'Category not found!' });
        }

        return res.json({ success: true, message: 'Category updated successfully!' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const id = req.params.id;

        const category = await Category.findByIdAndUpdate(id, { $set: { isDeleted: true } });

        if (!category) {
            return res.json({ success: false, message: 'Category not found!' });
        }

        return res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const unlistCategory = async (req, res) => {
    try {
        const id = req.params.id;

        const category = await Category.findByIdAndUpdate(id, { $set: { isListed: false } });

        if (!category) {
            return res.json({ success: false, message: 'Category not found!' });
        }

        return res.json({ success: true, message: 'Category unlisted' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const listCategory = async (req, res) => {
    try {
        const id = req.params.id;

        const category = await Category.findByIdAndUpdate(id, { $set: { isListed: true } });

        if (!category) {
            return res.json({ success: false, message: 'Category not found!' });
        }

        return res.json({ success: true, message: 'Category listed' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    LoadCategory,
    addCategory,
    editCategory,
    unlistCategory,
    listCategory,
    deleteCategory
};