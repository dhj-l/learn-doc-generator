# 🏃 考前速记卡（考前30分钟翻阅）

---

## 一、NumPy 核心（20秒扫完）

| 操作 | 代码 |
|------|------|
| 创建数组 | `np.array([1,2,3])` |
| 等间隔序列 | `np.arange(2,10,3)` → `[2 5 8]` |
| 全0/全1 | `np.zeros((2,3))` / `np.ones((2,2))` |
| 形状 | `arr.shape` → `(行,列)` |
| 变形状 | `arr.reshape(3,4)` / `arr.reshape(-1)` |
| 展平 | `arr.flatten()` |
| 转置 | `arr.T` |
| 索引 | `arr[行, 列]` |
| 布尔索引 | `arr[arr > 5]` |
| 多维条件 | `arr[(a>2) & (a<6)]`  ← **括号不能少！** |
| 求和/均值/标准差 | `np.sum()` / `np.mean()` / `np.std()` |
| 按轴统计 | `axis=0` 按列, `axis=1` 按行 |
| 矩阵乘 | `a @ b` 或 `np.dot(a,b)` |

---

## 二、Pandas 核心（30秒扫完）

| 操作 | 代码 |
|------|------|
| 读CSV | `pd.read_csv("file.csv")` |
| 预览 | `df.head()` / `df.info()` / `df.describe()` |
| 选列 | `df["列"]` 单列、`df[["列1","列2"]]` 多列 |
| 行索引 | `df.iloc[行, 列]`（整数位置）|
| 标签索引 | `df.loc[行标签, 列标签]` |
| **区别** | `iloc[0:3]` 取0,1,2（不含3）；`loc[0:3]` 取0,1,2,3（含3） |
| 条件筛选 | `df[df["成绩"] >= 80]` |
| 复合条件 | `df[(条件1) & (条件2)]` 用 `&` 不是 `and` |
| 缺失值检测 | `df.isna().sum()` |
| 填充缺失值 | `df.fillna(df.mean())` |
| 删除缺失行 | `df.dropna()` |
| 分组聚合 | `df.groupby("班级")["成绩"].mean()` |
| 多聚合 | `.agg(["mean", "sum", "count"])` |
| 合并表 | `pd.merge(a, b, on="学号", how="inner")` |
| 拼接 | `pd.concat([a, b], ignore_index=True)` |
| 透视表 | `pd.pivot_table(df, index=, columns=, values=, aggfunc="mean")` |
| 排序 | `df.sort_values("列", ascending=False)` |

---

## 三、Matplotlib 核心（15秒扫完）

| 操作 | 代码 |
|------|------|
| 创建画布 | `fig, ax = plt.subplots(figsize=(8,5))` |
| 折线图 | `ax.plot(x, y, marker="o")` |
| 柱状图 | `ax.bar(x, y)` |
| 饼图 | `ax.pie(data, labels=labels, autopct="%1.1f%%")` |
| 直方图 | `ax.hist(data, bins=10)` |
| 散点图 | `ax.scatter(x, y)` |
| 标题/标签 | `ax.set_title()` / `ax.set_xlabel()` / `ax.set_ylabel()` |
| 图例/网格 | `ax.legend()` / `ax.grid(True)` |
| 子图 | `fig, axes = plt.subplots(2, 3)` → 用 `axes[0,0]` |
| 保存 | `plt.savefig("fig.png")` 在 `show()` 之前调用 |

### 📊 图表选择速记

```
趋势变化 → 折线图（plot）
分类对比 → 柱状图（bar）
占比比例 → 饼图（pie）
数据分布 → 直方图（hist）
变量关系 → 散点图（scatter）
```

---

## 四、Python 基础速记（10秒扫完）

| 概念 | 要点 |
|------|------|
| 列表 `[]` | 可变，索引从0开始，切片 `[start:end]` 含头不含尾 |
| 元组 `()` | 不可变，适合函数多返回值 |
| 字典 `{}` | 键值对，用 `dict.get(key)` 安全访问 |
| 列表推导式 | `[x**2 for x in range(10) if x > 5]` |
| lambda | `lambda x: x * 2` |
| 文件读写 | `with open("f.txt", "r") as f:` |

---

## 五、考前 5 分钟「必看清单」

- [ ] `np.arange(start, stop, step)` 含头不含尾
- [ ] 布尔索引加括号：`arr[(a>2) & (a<6)]`
- [ ] `iloc[0:3]` 不含3，`loc[0:3]` 含3
- [ ] `groupby` 模式：`df.groupby("分组")["数值"].mean()`
- [ ] merge 的 `how`：inner/left/right/outer
- [ ] 图表选择：趋势→折线、对比→柱状、比例→饼图、分布→直方、相关→散点
- [ ] `plt.savefig()` 在 `plt.show()` 之前
- [ ] 缺失值：`fillna(均值)` / `dropna()`

---

> 💡 **祝考试顺利！70 分稳过！**
