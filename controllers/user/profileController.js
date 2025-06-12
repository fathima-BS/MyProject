const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require("bcrypt");
const fs = require('fs');
const path = require('path');
const { profileUpload } = require('../../config/multerconfig');
const Wallet = require('../../models/walletSchema');

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'WLT';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existingUser = await User.findOne({ referralCode: result });
    if (existingUser) {
        return createReferralCode();
    }
    return result;
}

async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });
        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your email address",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`
        });
        return info.accepted.length > 0;
    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
}

const generateReferralCode = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.json({ success: false, message: 'Not logged in', redirectUrl: '/login' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.json({ success: false, message: 'User not found', redirectUrl: '/login' });
        }

        if (user.referralCode) {
            return res.json({ success: false, message: 'Referral code already exists', referralCode: user.referralCode });
        }

        const referralCode = await createReferralCode();
        user.referralCode = referralCode;
        await user.save();

        console.log('Generated referral code for user:', user.email, referralCode);
        res.json({ success: true, referralCode });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const forgetPassword = async (req, res, next) => {
    try {
        return res.render('forgetPassword', { message: null });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const forgetPasswordsubmit = async (req, res, next) => {
    try {
        const { email } = req.body;

        const findUser = await User.findOne({ email });

        if (findUser) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);

            if (emailSent) {
                req.session.userOtp = otp;
                req.session.email = email;
                req.session.otpTimestamp = Date.now();
                console.log("OTP:", otp);
                return res.redirect("/forgotPassOtp");
            } else {
                return res.render("forgetPassword", {
                    message: "Failed to send OTP. Please try again",
                });
            }
        } else {
            return res.render("forgetPassword", {
                message: "User with this email does not exist",
            });
        }
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};

const showForgotOtpPage = async (req, res, next) => {
    try {
        if (!req.session.userOtp || !req.session.email || !req.session.otpTimestamp) {
            return res.redirect('/forget-password');
        }

        const timeElapsed = Math.floor((Date.now() - req.session.otpTimestamp) / 1000);
        const remainingTime = Math.max(0, 60 - timeElapsed); 

        res.render("forgotPassOtp", { remainingTime });  
    } catch (error) {
        error.statusCode = 500;
        next(error);
    }
};



const verifyForgetPassOtp = async (req, res, next) => {
    try {
        const { otp } = req.body;
        const storedOtp = req.session.userOtp;
        const email = req.session.email;
        const otpTimestamp = req.session.otpTimestamp;

        if (!email || !storedOtp || !otpTimestamp) {
            return res.json({ success: false, message: "Session expired. Please request a new OTP." });
        }

        // Check if OTP is expired (60 seconds)
        const currentTime = Date.now();
        const timeElapsed = (currentTime - otpTimestamp) / 1000; // in seconds
        if (timeElapsed > 60) {
            return res.json({ success: false, message: "OTP has expired. Please resend a new code." });
        }

        if (otp === storedOtp) {
            req.session.userOtp = null;
            req.session.otpTimestamp = null;
            return res.json({ success: true, redirectUrl: "/reset-password" });
        } else {
            return res.json({ success: false, message: "Invalid OTP. Please try again." });
        }
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const resendForgetPassOtp = async (req, res, next) => {
    try {
        const email = req.session.email;

        if (!email) {
            return res.json({ success: false, message: "Session expired. Please request a new OTP." });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            req.session.userOtp = otp;
            req.session.otpTimestamp = Date.now(); // Update timestamp
            console.log("Resent OTP:", otp);
            return res.json({ success: true });
        } else {
            return res.json({ success: false, message: "Failed to resend OTP. Please try again." });
        }
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const resetPass = async (req, res, next) => {
    try {
        res.render("resetPass");
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const newPass = async (req, res, next) => {
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
        error.statusCode = 500;
        next(error)
    }
};

const postNewPassword = async (req, res, next) => {
    try {
        console.log("Request body in postNewPassword:", req.body);

        const { NewPassword, password, confirmNewPassword } = req.body;
        const userId = req.session.user;

        console.log("Session userId:", userId);

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated. Please log in again.",
                redirectUrl: "/login"
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        console.log("User data in postNewPassword:", {
            userId: user._id,
            email: user.email,
            hasPassword: !!user.password,
            googleId: user.googleId
        });

        if (!password) {
            return res.status(400).json({ success: false, message: "Current password is required." });
        }

        if (!NewPassword) {
            return res.status(400).json({ success: false, message: "New password is required." });
        }

        if (!confirmNewPassword) {
            return res.status(400).json({ success: false, message: "Confirm new password is required." });
        }

        if (NewPassword !== confirmNewPassword) {
            return res.status(400).json({ success: false, message: "New password and confirmation do not match." });
        }

        if (!user.password) {
            return res.status(400).json({
                success: false,
                message: "No password set for this account. Please use the forgot password option."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Current password is incorrect." });
        }

        const passwordRegex = /^(?=.*\d).{6,}$/;
        if (!passwordRegex.test(NewPassword)) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 6 characters long and include at least one number."
            });
        }

        if (NewPassword === password) {
            return res.status(400).json({ success: false, message: "New password must be different from the current password." });
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(NewPassword, saltRounds);
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { password: passwordHash } },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(500).json({ success: false, message: "Failed to update password in the database." });
        }

        return res.status(200).json({ success: true, message: "Password updated successfully" });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const loadUserProfile = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }
        const userData = await User.findById(userId);

        if (!userData) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        return res.render('userProfile', { user: userData });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const PhoneNo = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const phone = req.body.phone?.trim();

        // Validate phone number
        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({ error: 'Phone number must be 10 digits' });
        }

        await User.findByIdAndUpdate(userId, { phone });
        res.json({ success: true, redirectUrl: '/userProfile' });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const loadEditProfile = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const userData = await User.findById(userId);
        if (!userData) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = {
            _id: userData._id,
            username: userData.username || '',
            email: userData.email || '',
            dateOfBirth: userData.dateOfBirth || '',
            profileImage: userData.profileImage || '',
            googleId: userData.googleId || null,
            phone: userData.phone || ''
        };

        if (req.session.emailVerified && req.session.newEmail) {
            user.email = req.session.newEmail;
        }
        return res.render('editProfile', { user });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const editProfile = (req, res, next) => {
    profileUpload(req, res, async (err) => {
        if (err) {
            console.error('Multer error:', err.stack);
            return res.status(400).json({ success: false, message: `Multer error: ${err.message}` });
        }

        try {
            const userId = req.session.user;
            if (!userId) {
                return res.status(401).json({ success: false, message: 'User not authenticated' });
            }

            const { fullName, birthdate, phone } = req.body;

            // Validation
            // Full Name: Required, 2+ characters, letters/spaces/hyphens only
            if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
                return res.status(400).json({ success: false, message: 'Full Name is required and must be at least 2 characters long' });
            }
            if (!/^[a-zA-Z\s-]+$/.test(fullName.trim())) {
                return res.status(400).json({ success: false, message: 'Full Name can only contain letters, spaces, or hyphens' });
            }

            // Birthdate: Optional, valid date, user must be at least 13 years old
            let parsedBirthdate;
            if (birthdate) {
                parsedBirthdate = new Date(birthdate);
                if (isNaN(parsedBirthdate.getTime())) {
                    return res.status(400).json({ success: false, message: 'Invalid date of birth format' });
                }
                const today = new Date();
                const minAgeDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
                if (parsedBirthdate > minAgeDate) {
                    return res.status(400).json({ success: false, message: 'You must be at least 13 years old' });
                }
            }

            // Phone: Optional, 10 digits if provided
            if (phone && phone.trim()) {
                if (!/^\d{10}$/.test(phone.trim())) {
                    return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits' });
                }
            }

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            // Check for changes
            let hasChanges = false;
            const updateData = {
                username: fullName.trim(),
                phone: phone ? phone.trim() : user.phone || '',
                ...(parsedBirthdate && { dateOfBirth: parsedBirthdate }),
            };

            // Compare fields
            if (updateData.username !== user.username) hasChanges = true;
            if (updateData.phone !== (user.phone || '')) hasChanges = true;
            if (parsedBirthdate && (!user.dateOfBirth || parsedBirthdate.getTime() !== user.dateOfBirth.getTime())) {
                hasChanges = true;
            } else if (!parsedBirthdate && user.dateOfBirth) {
                updateData.dateOfBirth = null; // Clear dateOfBirth if empty
                hasChanges = true;
            }

            // Handle profile image
            if (req.file) {
                if (user.profileImage) {
                    const oldImagePath = path.join(__dirname, '..', '..', 'public', user.profileImage);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
                updateData.profileImage = `/Uploads/profiles/${req.file.filename}`;
                hasChanges = true;
            }

            // Update only if there are changes
            if (hasChanges) {
                const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
                return res.status(200).json({
                    success: true,
                    message: 'Profile updated successfully',
                    user: updatedUser,
                    hasChanges: true
                });
            } else {
                return res.status(200).json({
                    success: true,
                    message: 'No changes detected',
                    user: user,
                    hasChanges: false
                });
            }
        } catch (error) {
            error.statusCode = 500;
            next(error)
        }
    });
};

const changeEmail = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);

        if (!userData) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.render('changeEmail', {
            title: 'Change Email',
            user: userData || null,
            currentEmail: userData.email || ''
        });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const sendOtp = async (req, res, next) => {
    try {
        const { email } = req.body;
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (email.toLowerCase() === user.email.toLowerCase()) {
            return res.json({ success: false, message: 'Cannot use your current email address' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser && existingUser._id.toString() !== userId) {
            return res.json({ success: false, message: 'Email is already in use by another account' });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            req.session.userOtp = otp;
            req.session.newEmail = email;
            req.session.otpTimestamp = Date.now(); // Store timestamp
            console.log("OTP for email verification:", otp);
            return res.json({ success: true });
        } else {
            return res.json({ success: false, message: "Failed to send OTP. Please try again." });
        }
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const getVerifyOtp = async (req, res, next) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.redirect('/edit-profile');
        }
        res.render('verifyProfileOtp', { email });
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const verifyOtp = async (req, res, next) => {
    try {
        const { email, otp } = req.body;
        const storedOtp = req.session.userOtp;
        const newEmail = req.session.newEmail;
        const userId = req.session.user;
        const otpTimestamp = req.session.otpTimestamp;

        if (!newEmail || !storedOtp || !otpTimestamp) {
            return res.json({ success: false, message: "Session expired. Please request a new OTP." });
        }

        if (email !== newEmail) {
            return res.json({ success: false, message: "Email does not match the one being verified." });
        }

        // Check if OTP is expired (60 seconds)
        const currentTime = Date.now();
        const timeElapsed = (currentTime - otpTimestamp) / 1000; // in seconds
        if (timeElapsed > 60) {
            return res.json({ success: false, message: "OTP has expired. Please resend a new code." });
        }

        if (otp === storedOtp) {
            await User.findByIdAndUpdate(userId, { email: newEmail });
            req.session.userOtp = null;
            req.session.newEmail = null;
            req.session.otpTimestamp = null;
            req.session.emailVerified = true;

            return res.json({ success: true, message: "Email verified and updated successfully." });
        } else {
            return res.json({ success: false, message: "Invalid OTP. Please try again." });
        }
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};

const resendOtp = async (req, res, next) => {
    try {
        const { email } = req.body;
        const newEmail = req.session.newEmail;
        const userId = req.session.user;

        if (!userId) {
            return res.json({ success: false, message: "User not authenticated. Please log in again." });
        }

        if (!email || !newEmail || email !== newEmail) {
            return res.json({ success: false, message: "Session expired or invalid email. Please request a new OTP." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.json({ success: false, message: "User not found." });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser && existingUser._id.toString() !== userId) {
            return res.json({ success: false, message: "Email is already in use by another account." });
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            req.session.userOtp = otp;
            req.session.otpTimestamp = Date.now(); // Update timestamp
            console.log("Resent OTP:", otp);
            return res.json({ success: true });
        } else {
            return res.json({ success: false, message: "Failed to resend OTP. Please try again." });
        }
    } catch (error) {
        error.statusCode = 500;
        next(error)
    }
};



module.exports = {
    forgetPassword,
    forgetPasswordsubmit,
    showForgotOtpPage,
    verifyForgetPassOtp,
    resendForgetPassOtp,
    resetPass,
    newPass,
    postNewPassword,
    loadUserProfile,
    PhoneNo,
    loadEditProfile,
    editProfile,
    changeEmail,
    sendOtp,
    getVerifyOtp,
    verifyOtp,
    resendOtp,
    generateReferralCode,

};