const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require("bcrypt");
const fs = require('fs');
const path = require('path');
const { profileUpload } = require('../../config/multerconfig');
const multer = require('multer');



function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
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

const forgetPassword = async (req, res) => {
    try {
        return res.render('forgetPassword', { message: null });
    } catch (error) {
        console.log("Forgot Password page not loading: ", error.message);
        res.status(500).json({ success: false, message: 'Server Error' });
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
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

const verifyForgetPassOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const storedOtp = req.session.userOtp;
        const email = req.session.email;

        if (!email || !storedOtp) {
            return res.json({ success: false, message: "Session expired. Please request a new OTP." });
        }

        if (otp === storedOtp) {
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
        console.error("Error while loading reset password", error.message);
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

const postNewPassword = async (req, res) => {
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
        console.error("Error in postNewPassword:", error.message);
        return res.status(500).json({ success: false, message: "Server error: " + error.message });
    }
};

const loadUserProfile = async (req, res) => {
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
        console.error("Error while loading Profile Page", error);
        return res.status(500).json({ success: false, message: 'Internal error' });
    }
};

const PhoneNo = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const phone = req.body.phone?.trim();

        // Validate phone number
        if (!phone) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        if (!/^\d{10}$/.test(phone)) {
            return res.status(400).json({ success: false, message: 'Phone number must be 10 digits' });
        }

        await User.findByIdAndUpdate(userId, { phone });
        res.json({ success: true, redirectUrl: '/userProfile' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: 'Internal error' });
    }
};

const loadEditProfile = async (req, res) => {
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
        console.error("Error while loading Profile Page", error);
        return res.status(500).json({ success: false, message: 'Internal error' });
    }
};

const editProfile = (req, res) => {
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

            const { fullName, birthdate, email, phone } = req.body;

            // Validation
            // Full Name: Required, 2+ characters, letters/spaces/hyphens only
            if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
                return res.status(400).json({ success: false, message: 'Full Name is required and must be at least 2 characters long' });
            }
            if (!/^[a-zA-Z\s-]+$/.test(fullName.trim())) {
                return res.status(400).json({ success: false, message: 'Full Name can only contain letters, spaces, or hyphens' });
            }

            // Email: Required, valid format
            if (!email || typeof email !== 'string') {
                return res.status(400).json({ success: false, message: 'Email is required' });
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                return res.status(400).json({ success: false, message: 'Invalid email format' });
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
                email: user.email,
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

            // Handle email verification
            if (req.session.emailVerified && req.session.newEmail) {
                updateData.email = req.session.newEmail;
                req.session.newEmail = null;
                req.session.emailVerified = false;
                hasChanges = true;
            } else if (email !== user.email) {
                return res.status(400).json({ success: false, message: 'Please verify your new email address before saving.' });
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
            console.error("Error while updating profile:", error.stack);
            res.status(500).json({ success: false, message: `Server error: ${error.message}` });
        }
    });
};

const sendOtp = async (req, res) => {
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

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            req.session.userOtp = otp;
            req.session.newEmail = email;
            console.log("OTP for email verification:", otp);
            return res.json({ success: true });
        } else {
            return res.json({ success: false, message: "Failed to send OTP. Please try again." });
        }
    } catch (error) {
        console.error("Error sending OTP:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

const getVerifyOtp = async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.redirect('/edit-profile');
        }
        res.render('verifyProfileOtp', { email });
    } catch (error) {
        console.error("Error loading OTP verification page:", error);
        res.status(500).json({ success: false, message: 'Internal error' });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const storedOtp = req.session.userOtp;
        const newEmail = req.session.newEmail;

        if (!newEmail || !storedOtp) {
            return res.json({ success: false, message: "Session expired. Please request a new OTP." });
        }

        if (email !== newEmail) {
            return res.json({ success: false, message: "Email does not match the one being verified." });
        }

        if (otp === storedOtp) {
            req.session.emailVerified = true;
            return res.json({ success: true });
        } else {
            return res.json({ success: false, message: "Invalid OTP. Please try again." });
        }
    } catch (error) {
        console.error("Error verifying OTP:", error);
        return res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    forgetPassword,
    forgetPasswordsubmit,
    verifyForgetPassOtp,
    resendForgetPassOtp,
    resetPass,
    newPass,
    postNewPassword,
    loadUserProfile,
    PhoneNo,
    loadEditProfile,
    editProfile,
    sendOtp,
    getVerifyOtp,
    verifyOtp
};