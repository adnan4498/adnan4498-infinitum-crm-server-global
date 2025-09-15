import jwt from 'jsonwebtoken'
import User from '../models/User.js';
 
const verifyUser = async (req, res, next) => {
    try {
        if (!req.headers.authorization) {
            return res.status(401).json({ success: false, error: "Unauthorized: No token provided" });
        }

        const tokenParts = req.headers.authorization.split(' ');
        if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
            return res.status(400).json({ success: false, error: "Invalid token format" });
        }

        const token = tokenParts[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded) {
            return res.status(401).json({ success: false, error: "Unauthorized: Invalid token" });
        }

        const user = await User.findById(decoded._id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error.message);
        return res.status(500).json({ success: false, error: "Server error: " + error.message });
    }
};


export default verifyUser