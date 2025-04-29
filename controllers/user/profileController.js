const User = require('../../models/userSchema')
const bcrypt = require("bcrypt")



function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString()
}


const forgetPassword = async (req, res) => {
    try {
        return res.render('forgetPassword', { message: null });
    } catch (error) {
        console.log("Forgot Password page not loading: ", error.message);
        res.status(500).render('error', { message: 'Server Error' });
    }
};

const forgetPasswordsubmit = async (req, res) => {
    try {
        const { email } = req.body;

        const findUser = await User.findOne({ email });

        if (findUser) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);

            if (emailSent) {
                req.session.userOtp = otp;
                req.session.email = email;
                res.render("forgotPassOtp");
                console.log("OTP:", otp);
            } else {
                res.json({ success: false, message: "Failed to send OTP. Please try again" });
            }
        } else {
            res.render("forgetPassword", {
                message: "User with this email does not exist",
            });
        }
    } catch (error) {
        res.status(500).render('error', { message: 'Server Error' });
    }
}
const verifyForgetPassOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const storedOtp = req.session.userOtp;
        const email = req.session.email;

        if (!email || !storedOtp) {
            return res.json({ success: false, message: "Session expired. Please request a new OTP." });
        }

        if (otp === storedOtp) {
            // OTP is valid, proceed to password reset page
            return res.json({ success: true, redirectUrl: "/reset-password" });
        } else {
            return res.json({ success: false, message: "Invalid OTP. Please try again." });
        }
    } catch (error) {
        console.error("Error verifying OTP:", error.message);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};



const resendForgetPassOtp = async (req, res) => {
    try {
        const email = req.session.email;

        if (!email) {
            return res.json({ success: false, message: "Session expired. Please request a new OTP." });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            req.session.userOtp = otp;
            console.log("Resent OTP:", otp);
            return res.json({ success: true });
        } else {
            return res.json({ success: false, message: "Failed to resend OTP. Please try again." });
        }
    } catch (error) {
        console.error("Error resending OTP:", error.message);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};


const resetPass = async (req, res) => {
    try {
        res.render("resetPass");
    } catch (error) {
        console.error("error while loading reset password", error.message);
        res.status(500).render('error', { message: 'Server Error' });
    }
};

const newPass = async (req, res) => {
    try {
        const { NewPassword, password } = req.body;
        const email = req.session.email;
        if (!email) {
            return res.render('resetPass', { message: 'Session expired. Please try again.' });
        }
        if (!NewPassword || !password) {
            return res.render('resetPass', { message: 'All fields are required.' });
        }
        const passwordRegex = /^(?=.*\d).{6,}$/;
        if (!passwordRegex.test(NewPassword)) {
            return res.render('resetPass', {
                message: 'Password must be at least 6 characters long and include at least one number.',
            });
        }
        if (NewPassword !== password) {
            return res.render('resetPass', { message: 'Passwords do not match.' });
        }
        const passwordHash = await bcrypt.hash(NewPassword, 10);
        const updatedUser = await User.findOneAndUpdate(
            { email },
            { $set: { password: passwordHash } },
            { new: true }
        );
        if (!updatedUser) {
            return res.render('resetPass', { message: 'User not found.' });
        }
        delete req.session.email;
        return res.redirect('/login?passwordchanged=true');

    } catch (error) {
        console.error('Error in newPass controller:', error);
        return res.render('resetPass', { message: 'An error occurred. Please try again later.' });
    }
};

module.exports = {
    forgetPassword,
    forgetPasswordsubmit,
    verifyForgetPassOtp,
    resendForgetPassOtp,
    resetPass,
    newPass
}