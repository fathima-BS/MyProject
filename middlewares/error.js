const userErrorHandler = (err, req, res, next) => {
    console.error("User Error:", err.message);
    
    const statusCode = err.statusCode || 500;
    const message = err.message || "Something went wrong!";

    res.setHeader("Cache-Control", "no-store");

    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(statusCode).json({
            success: false,
            message,
        });
    } else {
        return res.status(statusCode).render("page404", {
            errorMessage: message,
            statusCode,
        });
    }
};


const adminErrorHandler = (err, req, res, next) => {
    console.error("Admin Error:", err.message);

    const statusCode = err.statusCode || 500;
    const message = err.message || "Something went wrong!";

    res.setHeader("Cache-Control", "no-store");

    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(statusCode).json({
            success: false,
            message,
        });
    } else {
        return res.status(statusCode).render("adminPage404", {
            statusCode,
            errorMessage: message,
        });
    }
};


module.exports = {
    adminErrorHandler,
    userErrorHandler
}