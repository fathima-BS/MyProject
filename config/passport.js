const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const WalletTransaction = require('../models/walletSchema');

async function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'WLT';
  for (let i = 0; i < 6; i++) { // 6 additional characters to make total length 9 (WLT + 6)
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const existingUser = await User.findOne({ referralCode: result });
  if (existingUser) {
    return generateReferralCode(); // Recurse if code exists
  }
  return result;
}

function generateTransactionId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'WLT';
  for (let i = 0; i < 6; i++) { // 6 additional characters to make total length 9
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = function(passport) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback",
    passReqToCallback: true // Pass req to callback
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id }) || await User.findOne({ email: profile.emails[0].value });
      let referralCode = user?.referralCode || await generateReferralCode();

      // Handle referral code from session or query
      const referralCodeFromSession = req.session?.referralCode || req.query?.ref; // Use 'ref' to match signup.ejs
      if (referralCodeFromSession && !user) {
        req.session.referralCode = referralCodeFromSession;
      }

      if (user) {
        // Update existing user
        if (user.isBlocked) {
          return done(null, false, { message: 'Account is Blocked' });
        }
        if (!user.googleId) {
          user.googleId = profile.id;
        }
        if (!user.referralCode) {
          user.referralCode = referralCode;
          await user.save();
          console.log('Assigned referral code to existing user:', user.email, referralCode);
        }
        return done(null, user);
      }

      // Create new user
      user = new User({
        googleId: profile.id,
        username: profile.displayName || profile.emails[0].value.split('@')[0],
        email: profile.emails[0].value,
        referralCode,
        walletBalance: req.session.referralCode ? 500 : 0,
        isAdmin: false,
        createdOn: new Date()
      });

      // Apply referral bonuses
      if (req.session.referralCode) {
        const referrer = await User.findOne({ referralCode: req.session.referralCode });
        if (referrer && !referrer.isBlocked) {
          referrer.walletBalance += 1000;
          referrer.redeemedUsers.push(user._id);

          const referrerTransaction = new WalletTransaction({
            user: referrer._id,
            amount: 1000,
            type: 'credit',
            description: `Referral bonus for referring ${user.email}`,
            transactionId: generateTransactionId()
          });
          await referrerTransaction.save();
          referrer.walletTransactions.push(referrerTransaction._id);
          await referrer.save();
          console.log('Referrer bonus applied:', referrer.email, 'Transaction ID:', referrerTransaction._id);

          const newUserTransaction = new WalletTransaction({
            user: user._id,
            amount: 500,
            type: 'credit',
            description: `Referral bonus for using referral code ${req.session.referralCode}`,
            transactionId: generateTransactionId()
          });
          await newUserTransaction.save();
          user.walletTransactions.push(newUserTransaction._id);
          console.log('New user bonus applied:', user.email, 'Transaction ID:', newUserTransaction._id);

          delete req.session.referralCode;
        } else {
          console.log('Invalid or blocked referrer for code:', req.session.referralCode);
        }
      }

      await user.save();
      console.log('Created Google user:', user.email, 'Referral Code:', user.referralCode);
      return done(null, user);
    } catch (error) {
      console.error('Google auth error:', error);
      return done(error, null);
    }
  }));

  passport.serializeUser((user, done) => done(null, user._id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};