import axios from 'axios';

const axiosInstance = axios.create({
	baseURL: 'https://localhost:9000/api/v0/',
	headers: {
		'Content-Type': 'application/json'
	},
	withCredentials: true
});

export default axiosInstance;
