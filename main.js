// 杭咖 HANG COFFEE 智慧运营仿真平台 - 核心JavaScript

// 全局配置
const CONFIG = {
    brandName: '杭咖 HANG COFFEE',
    version: '1.0.0',
    simulationSpeed: 1,
    currency: '¥',
    timeZone: 'Asia/Shanghai'
};

// 数据存储（带localStorage持久化 + 离页补算）
const STORAGE_KEY = 'hangcoffee_datastore';
const LEAVE_TIME_KEY = 'hangcoffee_leave_time';
const RUNNING_KEY = 'hangcoffee_is_running';

function saveDataStore() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DataStore));
    } catch (e) {
        // 存储满时忽略
    }
}

function loadDataStore() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        const parsed = JSON.parse(saved);
        // 恢复Date对象
        if (parsed.simulation && parsed.simulation.currentTime) {
            parsed.simulation.currentTime = new Date(parsed.simulation.currentTime);
        }
        if (parsed.orders) {
            parsed.orders = parsed.orders.map(o => ({
                ...o,
                timestamp: new Date(o.timestamp)
            }));
        }
        // 跨页后interval已销毁，isRunning强制置false
        if (parsed.simulation) {
            parsed.simulation.isRunning = false;
        }
        return parsed;
    } catch (e) {
        return null;
    }
}

// 补算离页期间应产生的订单（最多补算10分钟仿真时间，防止暴增）
function catchUpSimulation(dataStore) {
    const wasRunning = localStorage.getItem(RUNNING_KEY) === 'true';
    if (!wasRunning) return;

    const leaveTimeStr = localStorage.getItem(LEAVE_TIME_KEY);
    if (!leaveTimeStr) return;

    const leaveTime = parseInt(leaveTimeStr, 10);
    const now = Date.now();
    const realElapsedMs = now - leaveTime; // 真实经过的毫秒数
    if (realElapsedMs <= 0) return;

    const speed = dataStore.simulation.speed || 1;
    // 仿真时间推进：每1000ms真实时间 = speed分钟仿真时间
    const simMinutesToAdd = Math.floor((realElapsedMs / 1000) * speed);
    // 上限：最多补算600仿真分钟（10小时仿真），避免数据爆炸
    const cappedMinutes = Math.min(simMinutesToAdd, 600);
    if (cappedMinutes <= 0) return;

    // 临时借用引擎逻辑补算订单
    const tempEngine = new SimulationEngine();
    for (let i = 0; i < cappedMinutes; i++) {
        const t = new Date(dataStore.simulation.currentTime);
        t.setMinutes(t.getMinutes() + 1);
        dataStore.simulation.currentTime = t;
        // 直接调用生成逻辑（不触发UI/存储）
        tempEngine._generateOrdersForTime(t);
    }

    // 截断订单数
    if (dataStore.orders.length > 2000) {
        dataStore.orders = dataStore.orders.slice(-2000);
    }
}

let DataStore = loadDataStore() || {
    shops: [],
    customers: [],
    products: [],
    orders: [],
    inventory: {},
    simulation: {
        isRunning: false,
        currentTime: new Date(),
        speed: 1,
        weather: 'sunny',
        marketing: []
    }
};

// 页面加载时立即补算离页期间的数据（需在SimulationEngine定义后执行，见底部）

// 店铺类型配置
const SHOP_TYPES = {
    hub: {
        name: '旗舰店 (Hub)',
        description: '位于核心商圈，面积大，品类全，兼具社交空间功能',
        baseArea: 200,
        baseRent: 50000,
        maxStaff: 15,
        capacity: 80
    },
    spoke: {
        name: '快取店 (Spoke)',
        description: '位于写字楼、地铁口，面积小，主打即买即走',
        baseArea: 50,
        baseRent: 15000,
        maxStaff: 6,
        capacity: 20
    },
    community: {
        name: '社区店',
        description: '位于居民区，注重邻里关系和会员复购',
        baseArea: 100,
        baseRent: 25000,
        maxStaff: 8,
        capacity: 40
    }
};

// 客户画像配置
const CUSTOMER_PROFILES = {
    business: {
        name: '商务白领',
        description: '购买频率高，对品质和效率要求高，价格敏感度中等',
        frequency: 0.8,
        priceSensitivity: 0.5,
        qualityPreference: 0.9,
        speedPreference: 0.9,
        peakHours: [8, 9, 12, 13, 15, 16],
        preferences: ['americano', 'latte', 'cappuccino']
    },
    student: {
        name: '在校学生',
        description: '价格敏感度高，易受社交媒体和折扣活动影响',
        frequency: 0.5,
        priceSensitivity: 0.9,
        qualityPreference: 0.6,
        speedPreference: 0.7,
        peakHours: [10, 11, 14, 15, 16, 17, 19, 20],
        preferences: ['latte', 'mocha', 'seasonal', 'frappe']
    },
    tourist: {
        name: '游客',
        description: '购买行为随机，易受地理位置和品牌知名度影响',
        frequency: 0.3,
        priceSensitivity: 0.4,
        qualityPreference: 0.7,
        speedPreference: 0.5,
        peakHours: [9, 10, 11, 14, 15, 16, 17],
        preferences: ['cappuccino', 'seasonal', 'dessert']
    },
    resident: {
        name: '社区居民',
        description: '注重性价比和便利性，有固定的消费习惯',
        frequency: 0.6,
        priceSensitivity: 0.7,
        qualityPreference: 0.7,
        speedPreference: 0.8,
        peakHours: [7, 8, 9, 18, 19, 20],
        preferences: ['americano', 'latte', 'tea']
    }
};

// 产品配置
const PRODUCTS = [
    // 经典咖啡
    { id: 'americano', name: '美式咖啡', category: 'coffee', cost: 8, price: 25, time: 2, ingredients: ['coffee'] },
    { id: 'latte', name: '拿铁咖啡', category: 'coffee', cost: 12, price: 35, time: 3, ingredients: ['coffee', 'milk'] },
    { id: 'cappuccino', name: '卡布奇诺', category: 'coffee', cost: 12, price: 35, time: 3, ingredients: ['coffee', 'milk'] },
    { id: 'macchiato', name: '玛奇朵', category: 'coffee', cost: 10, price: 30, time: 2.5, ingredients: ['coffee', 'milk'] },
    { id: 'mocha', name: '摩卡咖啡', category: 'coffee', cost: 15, price: 40, time: 4, ingredients: ['coffee', 'milk', 'chocolate'] },
    
    // 季节限定
    { id: 'seasonal-1', name: '焦糖肉桂拿铁', category: 'seasonal', cost: 18, price: 45, time: 4.5, ingredients: ['coffee', 'milk', 'syrup'] },
    { id: 'seasonal-2', name: '薄荷摩卡', category: 'seasonal', cost: 16, price: 42, time: 4, ingredients: ['coffee', 'milk', 'chocolate', 'mint'] },
    { id: 'seasonal-3', name: '榛果拿铁', category: 'seasonal', cost: 16, price: 42, time: 4, ingredients: ['coffee', 'milk', 'syrup'] },
    
    // 非咖啡饮品
    { id: 'tea-1', name: '抹茶拿铁', category: 'tea', cost: 10, price: 28, time: 3, ingredients: ['tea', 'milk'] },
    { id: 'tea-2', name: '红茶拿铁', category: 'tea', cost: 8, price: 25, time: 3, ingredients: ['tea', 'milk'] },
    { id: 'frappe-1', name: '焦糖冰沙', category: 'frappe', cost: 12, price: 32, time: 3.5, ingredients: ['ice', 'syrup', 'milk'] },
    { id: 'juice-1', name: '鲜榨橙汁', category: 'juice', cost: 6, price: 18, time: 2, ingredients: ['orange'] },
    
    // 烘焙点心
    { id: 'croissant', name: '可颂面包', category: 'bakery', cost: 5, price: 15, time: 0.5, ingredients: [] },
    { id: 'muffin', name: '玛芬蛋糕', category: 'bakery', cost: 6, price: 18, time: 0.5, ingredients: [] },
    { id: 'cheesecake', name: '芝士蛋糕', category: 'dessert', cost: 12, price: 35, time: 1, ingredients: [] },
    { id: 'tiramisu', name: '提拉米苏', category: 'dessert', cost: 15, price: 42, time: 1, ingredients: [] }
];

// 杭州区域配置
const HANGZHOU_DISTRICTS = [
    { id: 'xihu', name: '西湖区', locations: ['西湖文化广场', '黄龙商圈', '文三路'] },
    { id: 'shangcheng', name: '上城区', locations: ['湖滨商圈', '吴山广场', '城站'] },
    { id: 'gongshu', name: '拱墅区', locations: ['运河商圈', '万达广场', '城西银泰'] },
    { id: 'jianggan', name: '江干区', locations: ['钱江新城', '万象城', '杭州东站'] },
    { id: 'xiaoshan', name: '萧山区', locations: ['萧山市区', '杭州南站', '钱江世纪城'] },
    { id: 'yuhang', name: '余杭区', locations: ['未来科技城', '阿里巴巴', '老余杭'] },
    { id: 'binjiang', name: '滨江区', locations: ['滨江高新区', '网易大厦', '星光大道'] }
];

// 核心仿真引擎类
class SimulationEngine {
    constructor() {
        this.interval = null;
        this.events = [];
    }

    start() {
        if (DataStore.simulation.isRunning) return;
        
        DataStore.simulation.isRunning = true;
        // 记录"用户意图运行中"
        localStorage.setItem(RUNNING_KEY, 'true');
        localStorage.removeItem(LEAVE_TIME_KEY);
        
        this.interval = setInterval(() => {
            this.tick();
        }, 1000 / DataStore.simulation.speed);
        
        this.logEvent('仿真启动');
    }

    stop() {
        if (!DataStore.simulation.isRunning) return;
        
        DataStore.simulation.isRunning = false;
        localStorage.setItem(RUNNING_KEY, 'false');
        localStorage.removeItem(LEAVE_TIME_KEY);
        
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        this.logEvent('仿真暂停');
    }

    // 从localStorage恢复并自动继续运行（切回页面时调用）
    resume() {
        const wasRunning = localStorage.getItem(RUNNING_KEY) === 'true';
        if (!wasRunning) return false;
        // 补算离页订单
        catchUpSimulation(DataStore);
        saveDataStore();
        // 重新启动interval
        DataStore.simulation.isRunning = false; // 让start()能执行
        this.start();
        return true;
    }

    reset() {
        this.stop();
        DataStore.orders = [];
        DataStore.simulation.currentTime = new Date();
        saveDataStore();
        this.logEvent('仿真重置');
    }

    setSpeed(speed) {
        DataStore.simulation.speed = speed;
        if (DataStore.simulation.isRunning) {
            this.stop();
            this.start();
        }
        this.logEvent(`仿真速度设置为 ${speed}x`);
    }

    tick() {
        // 推进时间
        const currentTime = new Date(DataStore.simulation.currentTime);
        currentTime.setMinutes(currentTime.getMinutes() + 1);
        DataStore.simulation.currentTime = currentTime;

        // 生成订单
        this.generateOrders();
        
        // 更新库存
        this.updateInventory();
        
        // 触发事件
        this.triggerEvents();
        
        // 持久化数据（每tick保存，订单超2000条时截断防止localStorage溢出）
        if (DataStore.orders.length > 2000) {
            DataStore.orders = DataStore.orders.slice(-2000);
        }
        saveDataStore();
        
        // 更新UI
        this.updateUI();
    }

    generateOrders() {
        this._generateOrdersForTime(DataStore.simulation.currentTime);
    }

    // 补算专用：传入指定时间生成订单
    _generateOrdersForTime(simTime) {
        const currentHour = simTime.getHours();
        const currentDay = simTime.getDay();
        
        DataStore.shops.forEach(shop => {
            // 计算当前时段的基础客流量
            let baseTraffic = this.calculateBaseTraffic(shop, currentHour, currentDay);
            
            // 应用天气影响
            baseTraffic *= this.getWeatherMultiplier();
            
            // 应用营销活动影响
            baseTraffic *= this.getMarketingMultiplier(shop);
            
            // 生成订单
            const orderCount = Math.floor(baseTraffic / 10); // 每10个流量生成1个订单
            
            for (let i = 0; i < orderCount; i++) {
                const order = this.generateOrder(shop);
                if (order) {
                    DataStore.orders.push(order);
                    this.processOrder(shop, order);
                }
            }
        });
    }

    calculateBaseTraffic(shop, hour, day) {
        let traffic = 0;
        
        // 根据店铺类型和位置计算基础流量
        const locationMultiplier = this.getLocationMultiplier(shop.location);
        
        // 工作日和周末的流量模式不同
        if (day >= 1 && day <= 5) { // 工作日
            switch (shop.type) {
                case 'hub':
                    if (hour >= 8 && hour <= 10) traffic = 50; // 早高峰
                    else if (hour >= 12 && hour <= 14) traffic = 60; // 午餐高峰
                    else if (hour >= 18 && hour <= 21) traffic = 80; // 晚餐高峰
                    else traffic = 30;
                    break;
                case 'spoke':
                    if (hour >= 8 && hour <= 9) traffic = 40; // 早高峰
                    else if (hour >= 12 && hour <= 13) traffic = 35; // 午餐
                    else if (hour >= 15 && hour <= 16) traffic = 25; // 下午茶
                    else traffic = 10;
                    break;
                case 'community':
                    if (hour >= 7 && hour <= 9) traffic = 25; // 早晨
                    else if (hour >= 18 && hour <= 20) traffic = 30; // 晚上
                    else traffic = 15;
                    break;
            }
        } else { // 周末
            switch (shop.type) {
                case 'hub':
                    if (hour >= 10 && hour <= 12) traffic = 40;
                    else if (hour >= 14 && hour <= 17) traffic = 70;
                    else if (hour >= 19 && hour <= 22) traffic = 60;
                    else traffic = 25;
                    break;
                case 'spoke':
                    if (hour >= 10 && hour <= 11) traffic = 20;
                    else if (hour >= 14 && hour <= 16) traffic = 30;
                    else traffic = 10;
                    break;
                case 'community':
                    if (hour >= 9 && hour <= 11) traffic = 20;
                    else if (hour >= 15 && hour <= 17) traffic = 25;
                    else traffic = 15;
                    break;
            }
        }
        
        return traffic * locationMultiplier;
    }

    getLocationMultiplier(location) {
        const multipliers = {
            '西湖文化广场': 1.2,
            '黄龙商圈': 1.1,
            '湖滨商圈': 1.3,
            '钱江新城': 1.1,
            '万象城': 1.2,
            '未来科技城': 0.9,
            '阿里巴巴': 1.0,
            'default': 0.8
        };
        return multipliers[location] || multipliers.default;
    }

    getWeatherMultiplier() {
        const weatherEffects = {
            'sunny': 1.0,
            'rainy': 0.7,
            'snowy': 0.5,
            'hot': 1.1
        };
        return weatherEffects[DataStore.simulation.weather] || 1.0;
    }

    getMarketingMultiplier(shop) {
        let multiplier = 1.0;
        
        DataStore.simulation.marketing.forEach(campaign => {
            if (campaign.active && campaign.shops.includes(shop.id)) {
                multiplier += campaign.effect;
            }
        });
        
        return multiplier;
    }

    generateOrder(shop) {
        // 随机选择客户类型
        const customerTypes = Object.keys(CUSTOMER_PROFILES);
        const customerType = customerTypes[Math.floor(Math.random() * customerTypes.length)];
        const profile = CUSTOMER_PROFILES[customerType];
        
        // 根据客户偏好选择产品
        const preferredProducts = PRODUCTS.filter(p => 
            profile.preferences.includes(p.category) || 
            profile.preferences.includes(p.id)
        );
        
        if (preferredProducts.length === 0) return null;
        
        // 随机选择1-3个产品
        const itemCount = Math.floor(Math.random() * 3) + 1;
        const items = [];
        
        for (let i = 0; i < itemCount; i++) {
            const product = preferredProducts[Math.floor(Math.random() * preferredProducts.length)];
            items.push({
                productId: product.id,
                quantity: 1,
                price: product.price,
                cost: product.cost
            });
        }
        
        // 计算订单总额
        const totalAmount = items.reduce((sum, item) => sum + item.price, 0);
        const totalCost = items.reduce((sum, item) => sum + item.cost, 0);
        
        return {
            id: 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            shopId: shop.id,
            customerType: customerType,
            items: items,
            totalAmount: totalAmount,
            totalCost: totalCost,
            profit: totalAmount - totalCost,
            timestamp: new Date(DataStore.simulation.currentTime),
            isTakeaway: Math.random() > 0.6 // 40%概率为外卖
        };
    }

    processOrder(shop, order) {
        // 更新店铺收入
        shop.dailyRevenue = (shop.dailyRevenue || 0) + order.totalAmount;
        shop.dailyOrders = (shop.dailyOrders || 0) + 1;
        
        // 更新库存
        order.items.forEach(item => {
            const product = PRODUCTS.find(p => p.id === item.productId);
            if (product && product.ingredients) {
                product.ingredients.forEach(ingredient => {
                    if (!DataStore.inventory[shop.id]) {
                        DataStore.inventory[shop.id] = {};
                    }
                    DataStore.inventory[shop.id][ingredient] = 
                        (DataStore.inventory[shop.id][ingredient] || 0) - item.quantity;
                });
            }
        });
    }

    updateInventory() {
        // 检查库存并自动补货
        DataStore.shops.forEach(shop => {
            if (!DataStore.inventory[shop.id]) {
                DataStore.inventory[shop.id] = {};
            }
            
            // 为每种原料设置基础库存
            const ingredients = ['coffee', 'milk', 'chocolate', 'syrup', 'tea', 'ice', 'orange'];
            ingredients.forEach(ingredient => {
                if (!DataStore.inventory[shop.id][ingredient]) {
                    DataStore.inventory[shop.id][ingredient] = 100;
                }
                
                // 库存低于20时自动补货
                if (DataStore.inventory[shop.id][ingredient] < 20) {
                    DataStore.inventory[shop.id][ingredient] += 50;
                }
            });
        });
    }

    triggerEvents() {
        // 随机触发特殊事件
        if (Math.random() < 0.01) { // 1%概率
            const events = [
                '突发的客流高峰',
                '设备故障导致制作延迟',
                '原料短缺',
                '竞争对手促销活动',
                '社交媒体热点推荐'
            ];
            const event = events[Math.floor(Math.random() * events.length)];
            this.logEvent(`特殊事件: ${event}`);
        }
    }

    updateUI() {
        // 触发UI更新事件
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('simulationUpdate', {
                detail: {
                    time: DataStore.simulation.currentTime,
                    orders: DataStore.orders,
                    shops: DataStore.shops
                }
            }));
        }
    }

    logEvent(message) {
        this.events.push({
            message: message,
            timestamp: new Date(DataStore.simulation.currentTime)
        });
        
        // 保持最近100条事件
        if (this.events.length > 100) {
            this.events = this.events.slice(-100);
        }
    }

    // 设置天气
    setWeather(weather) {
        DataStore.simulation.weather = weather;
        this.logEvent(`天气变更为: ${weather}`);
    }

    // 添加营销活动
    addMarketingCampaign(campaign) {
        DataStore.simulation.marketing.push(campaign);
        this.logEvent(`营销活动启动: ${campaign.name}`);
    }

    // 移除营销活动
    removeMarketingCampaign(campaignId) {
        DataStore.simulation.marketing = DataStore.simulation.marketing.filter(c => c.id !== campaignId);
        this.logEvent(`营销活动结束: ${campaignId}`);
    }
}

// 数据分析工具类
class AnalyticsEngine {
    static getTotalRevenue(period = 'all') {
        let orders = DataStore.orders;
        
        if (period !== 'all') {
            const now = new Date();
            const startTime = new Date(now.getTime() - period);
            orders = orders.filter(order => order.timestamp >= startTime);
        }
        
        return orders.reduce((sum, order) => sum + order.totalAmount, 0);
    }

    static getTotalProfit(period = 'all') {
        let orders = DataStore.orders;
        
        if (period !== 'all') {
            const now = new Date();
            const startTime = new Date(now.getTime() - period);
            orders = orders.filter(order => order.timestamp >= startTime);
        }
        
        return orders.reduce((sum, order) => sum + order.profit, 0);
    }

    static getOrderCount(period = 'all') {
        let orders = DataStore.orders;
        
        if (period !== 'all') {
            const now = new Date();
            const startTime = new Date(now.getTime() - period);
            orders = orders.filter(order => order.timestamp >= startTime);
        }
        
        return orders.length;
    }

    static getAverageOrderValue(period = 'all') {
        const revenue = this.getTotalRevenue(period);
        const orderCount = this.getOrderCount(period);
        return orderCount > 0 ? revenue / orderCount : 0;
    }

    static getShopPerformance(shopId, period = 'all') {
        let orders = DataStore.orders.filter(order => order.shopId === shopId);
        
        if (period !== 'all') {
            const now = new Date();
            const startTime = new Date(now.getTime() - period);
            orders = orders.filter(order => order.timestamp >= startTime);
        }
        
        return {
            revenue: orders.reduce((sum, order) => sum + order.totalAmount, 0),
            profit: orders.reduce((sum, order) => sum + order.profit, 0),
            orderCount: orders.length,
            averageOrderValue: orders.length > 0 ? orders.reduce((sum, order) => sum + order.totalAmount, 0) / orders.length : 0
        };
    }

    static getProductPerformance(period = 'all') {
        let orders = DataStore.orders;
        
        if (period !== 'all') {
            const now = new Date();
            const startTime = new Date(now.getTime() - period);
            orders = orders.filter(order => order.timestamp >= startTime);
        }
        
        const productStats = {};
        
        orders.forEach(order => {
            order.items.forEach(item => {
                if (!productStats[item.productId]) {
                    productStats[item.productId] = {
                        quantity: 0,
                        revenue: 0,
                        name: PRODUCTS.find(p => p.id === item.productId)?.name || item.productId
                    };
                }
                
                productStats[item.productId].quantity += item.quantity;
                productStats[item.productId].revenue += item.price;
            });
        });
        
        return productStats;
    }

    static getCustomerTypeDistribution(period = 'all') {
        let orders = DataStore.orders;
        
        if (period !== 'all') {
            const now = new Date();
            const startTime = new Date(now.getTime() - period);
            orders = orders.filter(order => order.timestamp >= startTime);
        }
        
        const distribution = {};
        
        orders.forEach(order => {
            if (!distribution[order.customerType]) {
                distribution[order.customerType] = {
                    count: 0,
                    revenue: 0,
                    name: CUSTOMER_PROFILES[order.customerType]?.name || order.customerType
                };
            }
            
            distribution[order.customerType].count++;
            distribution[order.customerType].revenue += order.totalAmount;
        });
        
        return distribution;
    }

    static getHourlyDistribution(period = 'all') {
        let orders = DataStore.orders;
        
        if (period !== 'all') {
            const now = new Date();
            const startTime = new Date(now.getTime() - period);
            orders = orders.filter(order => order.timestamp >= startTime);
        }
        
        const hourlyData = Array(24).fill(0);
        
        orders.forEach(order => {
            const hour = order.timestamp.getHours();
            hourlyData[hour]++;
        });
        
        return hourlyData;
    }

    static exportData(format = 'json') {
        const data = {
            shops: DataStore.shops,
            orders: DataStore.orders,
            products: PRODUCTS,
            customerProfiles: CUSTOMER_PROFILES,
            simulation: DataStore.simulation,
            exportTime: new Date()
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else if (format === 'csv') {
            // 简单的CSV导出（仅订单数据）
            let csv = '订单ID,店铺ID,客户类型,总金额,利润,时间\n';
            DataStore.orders.forEach(order => {
                csv += `${order.id},${order.shopId},${order.customerType},${order.totalAmount},${order.profit},${order.timestamp.toISOString()}\n`;
            });
            return csv;
        }
        
        return data;
    }
}

// 初始化仿真引擎
const simulationEngine = new SimulationEngine();

// 工具函数
const Utils = {
    formatCurrency: (amount) => {
        return `${CONFIG.currency}${amount.toFixed(2)}`;
    },
    
    formatNumber: (number) => {
        return number.toLocaleString('zh-CN');
    },
    
    formatTime: (date) => {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    },
    
    formatDate: (date) => {
        return date.toLocaleDateString('zh-CN');
    },
    
    generateId: (prefix = 'id') => {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    getRandomElement: (array) => {
        return array[Math.floor(Math.random() * array.length)];
    },
    
    clamp: (value, min, max) => {
        return Math.min(Math.max(value, min), max);
    },
    
    lerp: (start, end, factor) => {
        return start + (end - start) * factor;
    }
};

// 导出全局对象
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.DataStore = DataStore;
    window.SHOP_TYPES = SHOP_TYPES;
    window.CUSTOMER_PROFILES = CUSTOMER_PROFILES;
    window.PRODUCTS = PRODUCTS;
    window.HANGZHOU_DISTRICTS = HANGZHOU_DISTRICTS;
    window.simulationEngine = simulationEngine;
    window.AnalyticsEngine = AnalyticsEngine;
    window.Utils = Utils;
}

// 默认数据初始化
function initializeDefaultData() {
    // 已有持久化数据则不覆盖
    const hasSavedData = localStorage.getItem(STORAGE_KEY) !== null;
    
    // 初始化默认店铺
    if (DataStore.shops.length === 0) {
        const defaultShops = [
            { id: 'shop_1', name: '西湖旗舰店', type: 'hub', location: '西湖文化广场', district: 'xihu' },
            { id: 'shop_2', name: '黄龙快取店', type: 'spoke', location: '黄龙商圈', district: 'xihu' },
            { id: 'shop_3', name: '湖滨社区店', type: 'community', location: '湖滨商圈', district: 'shangcheng' },
            { id: 'shop_4', name: '万象城旗舰店', type: 'hub', location: '万象城', district: 'jianggan' },
            { id: 'shop_5', name: '未来科技城店', type: 'spoke', location: '未来科技城', district: 'yuhang' }
        ];
        
        defaultShops.forEach(shop => {
            shop.rent = SHOP_TYPES[shop.type].baseRent;
            shop.staffCount = SHOP_TYPES[shop.type].maxStaff;
            shop.area = SHOP_TYPES[shop.type].baseArea;
            shop.dailyRevenue = 0;
            shop.dailyOrders = 0;
            shop.coordinates = generateRandomCoordinates(shop.district);
        });
        
        DataStore.shops = defaultShops;
    }
    
    // 生成演示订单数据
    if (DataStore.orders.length === 0) {
        generateDemoOrders();
    }
    
    // 保存初始数据
    saveDataStore();
}

// 生成演示订单数据
function generateDemoOrders() {
    const customerTypes = Object.keys(CUSTOMER_PROFILES);
    const now = new Date();
    
    // 生成过去24小时内的演示订单
    for (let i = 0; i < 50; i++) {
        const orderTime = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        const shop = DataStore.shops[Math.floor(Math.random() * DataStore.shops.length)];
        const customerType = customerTypes[Math.floor(Math.random() * customerTypes.length)];
        
        // 随机选择1-3个产品
        const itemCount = Math.floor(Math.random() * 3) + 1;
        const items = [];
        
        for (let j = 0; j < itemCount; j++) {
            const product = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
            items.push({
                productId: product.id,
                quantity: 1,
                price: product.price,
                cost: product.cost
            });
        }
        
        // 计算订单总额
        const totalAmount = items.reduce((sum, item) => sum + item.price, 0);
        const totalCost = items.reduce((sum, item) => sum + item.cost, 0);
        
        const order = {
            id: 'ORD_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            shopId: shop.id,
            customerType: customerType,
            items: items,
            totalAmount: totalAmount,
            totalCost: totalCost,
            profit: totalAmount - totalCost,
            timestamp: orderTime,
            isTakeaway: Math.random() > 0.6
        };
        
        DataStore.orders.push(order);
    }
    
    // 按时间排序
    DataStore.orders.sort((a, b) => a.timestamp - b.timestamp);
}

// 生成随机坐标（基于区域）
function generateRandomCoordinates(district) {
    const coordinates = {
        'xihu': [120.1215, 30.2594], // 西湖区
        'shangcheng': [120.1722, 30.2333], // 上城区
        'gongshu': [120.1341, 30.3038], // 拱墅区
        'jianggan': [120.2108, 30.2519], // 江干区
        'xiaoshan': [120.2641, 30.1851], // 萧山区
        'yuhang': [120.2987, 30.4197], // 余杭区
        'binjiang': [120.2098, 30.2098] // 滨江区
    };
    
    const baseCoord = coordinates[district] || coordinates['xihu'];
    const offset = 0.02; // 约2公里范围
    
    return [
        baseCoord[0] + (Math.random() - 0.5) * offset,
        baseCoord[1] + (Math.random() - 0.5) * offset
    ];
}

// 页面加载完成后初始化
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        initializeDefaultData();
        
        // 补算离页期间的订单，然后自动恢复运行
        simulationEngine.resume();
        
        // 触发初始化完成事件
        window.dispatchEvent(new CustomEvent('appInitialized'));
    });
    
    // 离开页面时记录时间戳（供下个页面补算）
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            if (localStorage.getItem(RUNNING_KEY) === 'true') {
                localStorage.setItem(LEAVE_TIME_KEY, Date.now().toString());
            }
        } else {
            // 回到页面时，如果仿真应该运行但interval已死，重新恢复
            if (localStorage.getItem(RUNNING_KEY) === 'true' && !DataStore.simulation.isRunning) {
                simulationEngine.resume();
            }
        }
    });
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        DataStore,
        SHOP_TYPES,
        CUSTOMER_PROFILES,
        PRODUCTS,
        HANGZHOU_DISTRICTS,
        SimulationEngine,
        AnalyticsEngine,
        Utils
    };
}