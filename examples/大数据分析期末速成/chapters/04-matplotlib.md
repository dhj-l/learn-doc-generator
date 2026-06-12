# 第4章 Matplotlib 数据可视化

> ⏱ 预计学习时间：1-2 小时 | 🎯 目标：掌握 5 种基本图表的绘制，能根据场景选择合适的图表类型

## 🎯 本章目标

学习完本章，你将能够：
- 绘制折线图、柱状图、饼图、直方图、散点图
- 设置图表标题、轴标签、图例、网格
- 创建子图（subplots）进行多图对比
- 根据分析场景选择合适的图表类型（选择题高频！）
- 保存图表为图片文件

## 📋 前置知识

> - [第0章 Python 基础速通](./00-python-crash.md)（函数部分）
> - [第1章 NumPy 数组操作](./01-numpy.md)（Matplotlib 常与 NumPy 配合使用）

---

## 💡 核心概念

### 4.1 Matplotlib 是什么？

Matplotlib 是 Python 最流行的**数据可视化**库。它就像一支"画笔"，能把数据变成各种图表。

```python
import matplotlib.pyplot as plt   # 标准简写
import numpy as np                 # 经常一起用
```

**两种绘图风格：**
1. **pyplot 风格**（简单快速）：`plt.plot(x, y)` 直接画
2. **面向对象风格**（更灵活）：`fig, ax = plt.subplots()` → `ax.plot(x, y)`

> **💡 考试提示**：考试中两种风格都可能出现，建议掌握面向对象风格（更规范）

---

## 4.2 折线图——显示数据趋势

最常用的图表，适合展示数据随时间的变化趋势。

```python
import matplotlib.pyplot as plt
import numpy as np

# ─── 准备数据 ───
x = np.array([1, 2, 3, 4, 5, 6])          # 月份
y = np.array([20, 25, 22, 30, 28, 35])     # 销售额（万元）

# ─── pyplot风格 ───
plt.plot(x, y)
plt.show()          # 显示图表（在Jupyter中可以不加）

# ─── 面向对象风格（推荐） ───
fig, ax = plt.subplots(figsize=(8, 5))     # 创建画布，8×5英寸

ax.plot(x, y, marker="o", linestyle="-", color="blue", linewidth=2, label="销售额")

ax.set_title("2025年上半年销售额趋势", fontsize=14)  # 标题
ax.set_xlabel("月份", fontsize=12)                    # X轴标签
ax.set_ylabel("销售额（万元）", fontsize=12)           # Y轴标签
ax.legend()                                            # 显示图例
ax.grid(True, linestyle="--", alpha=0.7)               # 网格线

plt.show()

# ─── 多条折线对比 ───
y2 = np.array([18, 22, 24, 26, 25, 28])     # 另一条数据线

fig, ax = plt.subplots(figsize=(8, 5))
ax.plot(x, y, marker="o", label="产品A")
ax.plot(x, y2, marker="s", label="产品B")
ax.set_title("产品销售额对比")
ax.set_xlabel("月份")
ax.set_ylabel("销售额（万元）")
ax.legend()
ax.grid(True, linestyle=":")
plt.show()
```

**折线图适用场景**：展示趋势、时间序列、多组数据的对比

---

## 4.3 柱状图——比较分类数据

适合展示不同类别之间的数值对比。

```python
# ─── 基本柱状图 ───
categories = ["苹果", "香蕉", "橘子", "葡萄", "西瓜"]
values = [30, 45, 25, 35, 50]

fig, ax = plt.subplots(figsize=(8, 5))
ax.bar(categories, values, color="skyblue", edgecolor="navy")

ax.set_title("水果销量统计")
ax.set_xlabel("水果种类")
ax.set_ylabel("销量（吨）")

# 在柱子上显示数值
for i, v in enumerate(values):
    ax.text(i, v + 1, str(v), ha="center")

plt.show()

# ─── 水平柱状图 ───
fig, ax = plt.subplots(figsize=(8, 5))
ax.barh(categories, values, color="lightcoral")
ax.set_title("水果销量统计（水平）")
ax.set_xlabel("销量（吨）")
ax.set_ylabel("水果种类")
plt.show()

# ─── 分组柱状图 ───
x = np.arange(3)  # 3个季度
width = 0.35

sales_a = [20, 35, 30]
sales_b = [25, 32, 28]

fig, ax = plt.subplots(figsize=(8, 5))
bars1 = ax.bar(x - width/2, sales_a, width, label="产品A")
bars2 = ax.bar(x + width/2, sales_b, width, label="产品B")

ax.set_xlabel("季度")
ax.set_ylabel("销售额（万元）")
ax.set_title("各季度产品销售额对比")
ax.set_xticks(x)
ax.set_xticklabels(["Q1", "Q2", "Q3"])
ax.legend()
plt.show()
```

**柱状图适用场景**：分类对比、排名展示、分组比较

---

## 4.4 饼图——展示比例关系

适合展示各部分占总体的比例。

```python
# ─── 基本饼图 ───
labels = ["计算机", "大数据", "人工智能", "软件工程"]
sizes = [30, 25, 20, 15]             # 各部分大小
colors = ["#ff9999", "#66b3ff", "#99ff99", "#ffcc99"]
explode = (0, 0.1, 0, 0)             # 突出第二个扇形

fig, ax = plt.subplots(figsize=(8, 6))
ax.pie(sizes, labels=labels, colors=colors, explode=explode,
       autopct="%1.1f%%", startangle=90, shadow=True)
ax.set_title("各专业学生人数占比")
plt.show()
```

**饼图适用场景**：展示比例/占比、组成部分相对大小（一般不超过6类）

> **⚠️ 注意**：饼图不适合比较数值大小，柱状图更适合精确对比

---

## 4.5 直方图——展示数据分布

展示数据的分布情况——数据集中在哪个区间。

```python
# ─── 生成数据 ───
np.random.seed(42)
scores = np.random.normal(75, 10, 1000)  # 1000个成绩，均值75，标准差10

fig, ax = plt.subplots(figsize=(8, 5))
ax.hist(scores, bins=15, color="lightblue", edgecolor="black", alpha=0.7)

ax.set_title("学生成绩分布直方图")
ax.set_xlabel("成绩")
ax.set_ylabel("人数")
ax.grid(True, linestyle="--", alpha=0.3)
plt.show()

# ─── 累计直方图 ───
fig, ax = plt.subplots(figsize=(8, 5))
ax.hist(scores, bins=15, cumulative=True, color="lightgreen",
        edgecolor="black", alpha=0.7)
ax.set_title("学生成绩累计分布")
ax.set_xlabel("成绩")
ax.set_ylabel("累计人数")
plt.show()
```

**直方图适用场景**：查看数据分布形态、检测异常值、判断数据偏态

> **💡 考试重点**：直方图 `hist` 和柱状图 `bar` 的区别——直方图展示**分布**（连续数据分组），柱状图展示**比较**（分类数据）

---

## 4.6 散点图——展示两个变量关系

```python
# ─── 准备数据 ───
np.random.seed(42)
study_hours = np.random.uniform(1, 10, 50)       # 学习时间
exam_scores = 60 + 3 * study_hours + np.random.randn(50) * 5  # 考试成绩

fig, ax = plt.subplots(figsize=(8, 5))
ax.scatter(study_hours, exam_scores, color="red", alpha=0.6, s=50)

ax.set_title("学习时间与考试成绩关系")
ax.set_xlabel("每天学习时间（小时）")
ax.set_ylabel("考试成绩")
ax.grid(True, linestyle="--", alpha=0.3)
plt.show()
```

**散点图适用场景**：分析两个变量的相关性、发现数据聚类、检测异常点

---

## ⚡ 进阶技巧

### 4.7 子图——多图并排

```python
# ─── 2×2 子图 ───
fig, axes = plt.subplots(2, 2, figsize=(12, 8))  # 2行2列

x = np.arange(1, 7)
y1 = [20, 25, 22, 30, 28, 35]
y2 = [30, 45, 25, 35, 50]

# 左上：折线图
axes[0, 0].plot(x, y1, marker="o", color="blue")
axes[0, 0].set_title("折线图")

# 右上：柱状图
categories = ["苹果", "香蕉", "橘子", "葡萄", "西瓜"]
axes[0, 1].bar(categories, y2, color="orange")
axes[0, 1].set_title("柱状图")

# 左下：饼图
sizes = [30, 25, 20, 15]
labels = ["A", "B", "C", "D"]
axes[1, 0].pie(sizes, labels=labels, autopct="%1.1f%%")
axes[1, 0].set_title("饼图")

# 右下：散点图
axes[1, 1].scatter(x, y1, color="green", s=50)
axes[1, 1].set_title("散点图")

plt.tight_layout()  # 自动调整布局，避免重叠
plt.show()

# ─── 一行多图 ───
fig, axes = plt.subplots(1, 3, figsize=(15, 4))

axes[0].plot([1, 2, 3], [1, 4, 9])
axes[0].set_title("折线")

axes[1].bar(["A", "B", "C"], [3, 7, 5])
axes[1].set_title("柱状")

axes[2].pie([3, 7, 5], labels=["A", "B", "C"])
axes[2].set_title("饼图")

plt.tight_layout()
plt.show()
```

---

## 🔨 实战演练

### 练习：综合数据可视化

**场景描述：**
你有一份 2025 年 1-6 月的销售数据（月份 vs 销售额），需要绘制一张完整的、带标题/标签/图例/网格的专业级折线图，并保存为图片文件。

**你的任务：**
1. 创建画布（8×5 英寸）
2. 绘制带圆形标记的蓝色折线图
3. 添加标题、轴标签、图例、网格线
4. 保存为 "sales_trend.png"
5. 显示图表

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```python
# ─── 完整美化示例 ───
x = np.arange(1, 13)
y = np.array([20, 22, 25, 28, 30, 35, 33, 31, 28, 26, 23, 21])

fig, ax = plt.subplots(figsize=(10, 6))

# 主图
ax.plot(x, y, color="#E74C3C", linewidth=2.5, marker="o",
        markersize=8, markerfacecolor="white", markeredgewidth=2,
        label="月均温度")

# 填充区域
ax.fill_between(x, y, alpha=0.2, color="#E74C3C")

# 标题和标签
ax.set_title("2025年月平均温度变化", fontsize=16, fontweight="bold", pad=15)
ax.set_xlabel("月份", fontsize=12)
ax.set_ylabel("温度 (°C)", fontsize=12)

# 坐标轴设置
ax.set_xticks(x)
ax.set_xticklabels(["1月","2月","3月","4月","5月","6月",
                     "7月","8月","9月","10月","11月","12月"], rotation=45)

# 网格和图例
ax.grid(True, linestyle="--", alpha=0.5)
ax.legend(fontsize=12)

# 标注最大值
max_idx = y.argmax()
ax.annotate(f"最高 {y.max()}°C",
            xy=(x[max_idx], y[max_idx]),
            xytext=(x[max_idx]+1, y[max_idx]+2),
            arrowprops=dict(arrowstyle="->", color="gray"))

plt.tight_layout()
plt.savefig("temperature.png", dpi=150, bbox_inches="tight")  # 保存图片
plt.show()
```

**预期输出：**
> 生成 temperature.png 文件，显示一条带填充区域的红色折线图，标注了最高温度点。
</details>

---

## 4.9 图表选择指南（选择题必考！）

| 图表类型 | 适用场景 | 坐标系 |
|----------|----------|--------|
| **折线图** `plot` | 展示趋势、时间序列变化 | 连续X轴 |
| **柱状图** `bar` | 分类数据对比、排名 | 分类X轴 |
| **饼图** `pie` | 各部分占总体的比例 | 角度 |
| **直方图** `hist` | 数据分布情况 | 连续区间 |
| **散点图** `scatter` | 两变量关系、相关性 | 两个连续轴 |

**典型选择题示例：**
- "要展示某公司2025年各月销售额变化趋势，应选用？" → **折线图**
- "要比较不同班级的考试成绩，应选用？" → **柱状图**
- "要展示各产品销售额占总销售额的比例，应选用？" → **饼图**
- "要展示1000名学生成绩的分布情况，应选用？" → **直方图**
- "要分析学习时间和考试成绩的相关性，应选用？" → **散点图**

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：`plt.plot()` 和 `plt.bar()` 分别用于什么场景？**
> A：`plot()` 画折线图（趋势），`bar()` 画柱状图（分类对比）。

**Q2：如何在一个画布上创建 2 行 3 列的子图？**
> A：`fig, axes = plt.subplots(2, 3)`，然后通过 `axes[0,0]`、`axes[0,1]` 等访问每个子图。

**Q3：直方图（hist）和柱状图（bar）的区别是什么？**
> A：直方图展示连续数据的分布（柱子无间隔），柱状图展示分类数据的比较（柱子有间隔）。

**Q4：`plt.savefig("chart.png")` 的作用是什么？**
> A：将当前图表保存为 PNG 图片文件。

**Q5：要展示两个变量之间是否有相关性，应该用什么图？**
> A：散点图（scatter）。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 图表显示空白 | 忘记加 `plt.show()` | 末尾加 `plt.show()` |
| 中文显示为方框 | 未设置中文字体 | `plt.rcParams['font.sans-serif']=['SimHei']` |
| 子图标签重叠 | 布局拥挤 | 加 `plt.tight_layout()` |
| 两次 `plt.plot` 画在同一张图上 | 没新建画布 | 用 `fig, ax = plt.subplots()` 创建新图 |

---

## 📝 本章小结

- ✅ 折线图 `plot`：展示趋势变化
- ✅ 柱状图 `bar`：展示分类对比
- ✅ 饼图 `pie`：展示占比关系
- ✅ 直方图 `hist`：展示数据分布
- ✅ 散点图 `scatter`：展示变量关系
- ✅ `subplots()` 创建子图、`savefig()` 保存图片
- ✅ 牢记每种图表的适用场景（选择题高频！）

## ➡️ 下一章预告

> 四章知识点都学完了！下一章是一套**全真模拟试卷**，检验你的学习成果，提前适应考试节奏。
> [下一章：全真模拟试卷](./05-practice-exam.md)
