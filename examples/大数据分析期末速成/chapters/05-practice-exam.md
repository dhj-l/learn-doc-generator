# 第5章 全真模拟试卷

> ⏱ 建议用时：**2 小时**（含复盘）
>
> 📌 覆盖范围：Python 基础 + NumPy + Pandas + Matplotlib
> 📌 难度说明：基础题 60% + 中等题 30% + 拔高题 10%（目标 70 分）
> 📌 **做题建议**：先闭卷完成，再对照答案解析查漏补缺

---

## 一、选择题（每题 4 分，共 40 分）

**1. 下列关于 Python 列表和元组的说法，正确的是？**  
A. 列表用圆括号 `()` 表示  
B. 元组创建后可以修改元素  
C. 列表用方括号 `[]` 表示，是可变的  
D. 元组用方括号 `[]` 表示，是不可变的

<details>
<summary>✅ 查看答案</summary>

> **正确答案：C**  
> 列表用 `[]` 表示可修改，元组用 `()` 表示不可修改。A 错误（列表用 `[]`），B 错误（元组不可变），D 错误（元组用 `()`）。
</details>

---

**2. 执行 `np.arange(2, 10, 3)` 的结果是？**  
A. `[2 5 8]`  
B. `[2 5 8 11]`  
C. `[3 6 9]`  
D. `[2 3 4 5 6 7 8 9]`

<details>
<summary>✅ 查看答案</summary>

> **正确答案：A**  
> `np.arange(start, stop, step)` 从2开始，步长为3，小于10的最大值是8。所以结果是 `[2 5 8]`。
</details>

---

**3. 已知 `arr = np.array([[1,2,3],[4,5,6]])`，表达式 `arr[1, 2]` 的值是？**  
A. 2  
B. 4  
C. 5  
D. 6

<details>
<summary>✅ 查看答案</summary>

> **正确答案：D**  
> `arr[1, 2]` 表示第1行（从0开始）第2列的元素，即第2行第3列，值为 6。
</details>

---

**4. 下列关于 Pandas 中 `iloc` 和 `loc` 的说法，错误的是？**  
A. `iloc` 使用整数位置索引  
B. `loc` 使用标签名称索引  
C. `iloc[0:3]` 和 `loc[0:3]` 结果完全一样  
D. `loc` 切片包含结束位置

<details>
<summary>✅ 查看答案</summary>

> **正确答案：C**  
> `iloc[0:3]` 取位置0、1、2（不含3），`loc[0:3]` 取标签0到3（含3）。当索引是默认的 0~N-1 时，`loc[0:3]` 比 `iloc[0:3]` 多一行。
</details>

---

**5. Pandas 中使用什么方法可以快速查看 DataFrame 前 5 行数据？**  
A. `df.top()`  
B. `df.front()`  
C. `df.preview()`  
D. `df.head()`

<details>
<summary>✅ 查看答案</summary>

> **正确答案：D**  
> `df.head()` 是最常用的预览数据方法，默认显示前5行。
</details>

---

**6. 下列哪种图表最适合展示某公司 2025 年各月的销售额变化趋势？**  
A. 饼图  
B. 折线图  
C. 直方图  
D. 散点图

<details>
<summary>✅ 查看答案</summary>

> **正确答案：B**  
> 折线图最适合展示时间序列数据的变化趋势。饼图展示比例，直方图展示分布，散点图展示相关性。
</details>

---

**7. 在 Matplotlib 中，`plt.subplots(2, 3)` 会创建什么？**  
A. 2行3列共6个子图的画布  
B. 2列3行共6个子图的画布  
C. 2个子图  
D. 3个子图

<details>
<summary>✅ 查看答案</summary>

> **正确答案：A**  
> `plt.subplots(2, 3)` 创建 2 行 3 列共 6 个子图的画布。
</details>

---

**8. Pandas 中 `df.groupby("班级")["成绩"].mean()` 的作用是？**  
A. 按班级分组，计算每个学生的平均成绩  
B. 按成绩分组，计算每个班级的平均成绩  
C. 按班级分组，计算每个班的平均成绩  
D. 计算所有学生的平均成绩

<details>
<summary>✅ 查看答案</summary>

> **正确答案：C**  
> 按"班级"列分组，对每个组的"成绩"列计算平均值，得到每个班的平均成绩。
</details>

---

**9. `pd.merge(df1, df2, on="学号", how="inner")` 中 `how="inner"` 的含义是？**  
A. 左连接，保留左边所有行  
B. 右连接，保留右边所有行  
C. 内连接，只保留两边都匹配的行  
D. 外连接，保留所有行

<details>
<summary>✅ 查看答案</summary>

> **正确答案：C**  
> `inner` 内连接：只保留两个 DataFrame 中连接键都存在的行。
</details>

---

**10. 对于缺失值处理，下列哪种说法是错误的？**  
A. `df.isna()` 可以检测缺失值  
B. `df.dropna()` 可以删除含有缺失值的行  
C. `df.fillna(0)` 用 0 填充缺失值  
D. 缺失值只能用 0 填充，不能用均值填充

<details>
<summary>✅ 查看答案</summary>

> **正确答案：D**  
> 缺失值可以用多种方式填充，包括固定值（如0）、均值、中位数、前向填充等。用均值填充是常见做法。
</details>

---

## 二、填空题（每题 4 分，共 20 分）

**1. NumPy 中，查看数组形状的属性是 `____`。**  

<details>
<summary>✅ 查看答案</summary>

> **答案：`.shape`**  
> `arr.shape` 返回元组，如 `(3, 4)` 表示 3 行 4 列。
</details>

---

**2. Pandas 中读取 CSV 文件的方法是 `pd.____`。**  

<details>
<summary>✅ 查看答案</summary>

> **答案：`read_csv()`**  
> `pd.read_csv("文件名.csv")` 是最常用的数据读取方式。
</details>

---

**3. 在 Matplotlib 中，显示图表的函数是 `plt.____`。**  

<details>
<summary>✅ 查看答案</summary>

> **答案：`show()`**  
> `plt.show()` 用于显示绘制的图表。如果没有调用该函数，图表不会显示。
</details>

---

**4. NumPy 中将数组展平为一维的方法有 `flatten()` 和 `____`。**  

<details>
<summary>✅ 查看答案</summary>

> **答案：`ravel()` 或 `reshape(-1)`**  
> 三者都可将数组展平为一维：`flatten()` 返回副本，`ravel()` 返回视图，`reshape(-1)` 自动推断维度。
</details>

---

**5. Pandas 中用于删除重复行的方法是 `df.____`。**  

<details>
<summary>✅ 查看答案</summary>

> **答案：`drop_duplicates()`**  
> `df.drop_duplicates()` 删除完全重复的行，可通过 `subset` 参数指定按哪些列判断重复。
</details>

---

## 三、代码题（共 40 分）

### 第1题：NumPy 数组操作（12分）

**题目描述：**
有一个 NumPy 数组 `arr = np.array([[10, 20, 30, 40], [50, 60, 70, 80], [90, 100, 110, 120]])`，请完成以下操作：

1. 输出数组的形状（2分）
2. 提取第二行所有元素（2分）
3. 提取所有行的第1列和第3列（3分）
4. 计算所有元素的平均值（2分）
5. 将所有大于60的元素替换为0（3分）

**🧑‍💻 先自己写，写完再展开看参考答案**

<details>
<summary>✅ 展开查看参考实现</summary>

```python
import numpy as np

arr = np.array([[10, 20, 30, 40],
                [50, 60, 70, 80],
                [90, 100, 110, 120]])

# 1. 输出形状
print("形状:", arr.shape)        # (3, 4)

# 2. 第二行所有元素
print("第二行:", arr[1, :])       # [50 60 70 80]

# 3. 所有行的第1列和第3列
print("第1列和第3列:\n", arr[:, [0, 2]])
# [[10 30]
#  [50 70]
#  [90 110]]

# 4. 所有元素的平均值
print("平均值:", np.mean(arr))    # 65.0

# 5. 将所有大于60的元素替换为0
arr[arr > 60] = 0
print("替换后:\n", arr)
# [[10 20 30 40]
#  [50 60  0  0]
#  [ 0  0  0  0]]
```

**评分标准：**
- 第1题：正确使用 `.shape`（2分）
- 第2题：正确索引第二行 `arr[1]` 或 `arr[1, :]`（2分）
- 第3题：正确使用切片 `arr[:, [0, 2]]`（3分）
- 第4题：正确使用 `np.mean()` 或 `arr.mean()`（2分）
- 第5题：正确使用布尔索引 `arr[arr > 60] = 0`（3分）

</details>

---

### 第2题：Pandas 数据清洗与统计（14分）

**题目描述：**
给定以下学生成绩数据：

```python
import pandas as pd
import numpy as np

data = {
    "姓名": ["张三", "李四", "王五", "赵六", "钱七"],
    "班级": ["A班", "A班", "B班", "B班", "C班"],
    "成绩": [85, None, 78, 92, None],
    "年龄": [20, 21, 19, None, 20]
}
df = pd.DataFrame(data)
```

请完成：

1. 显示 DataFrame 的基本信息（2分）
2. 检测每列的缺失值个数（2分）
3. 用每列的均值填充缺失值（3分）
4. 筛选出成绩 ≥ 80 的行（2分）
5. 按班级分组，计算每班的平均成绩（3分）
6. 按成绩从高到低排序（2分）

<details>
<summary>✅ 展开查看参考实现</summary>

```python
import pandas as pd
import numpy as np

data = {
    "姓名": ["张三", "李四", "王五", "赵六", "钱七"],
    "班级": ["A班", "A班", "B班", "B班", "C班"],
    "成绩": [85, None, 78, 92, None],
    "年龄": [20, 21, 19, None, 20]
}
df = pd.DataFrame(data)

# 1. 基本信息
print(df.info())

# 2. 检测缺失值
print("缺失值统计:\n", df.isna().sum())

# 3. 用各列均值填充缺失值
df["成绩"] = df["成绩"].fillna(df["成绩"].mean())  # 均值 = (85+78+92)/3 = 85
df["年龄"] = df["年龄"].fillna(df["年龄"].mean())
print("填充后:\n", df)

# 4. 筛选成绩≥80的行
high_scores = df[df["成绩"] >= 80]
print("成绩≥80:\n", high_scores)

# 5. 按班级分组统计平均成绩
print("各班平均成绩:\n", df.groupby("班级")["成绩"].mean())

# 6. 按成绩降序排序
df_sorted = df.sort_values("成绩", ascending=False)
print("按成绩降序:\n", df_sorted)
```

**评分标准：**
- 第1题：使用 `df.info()` 或 `df.dtypes`（2分）
- 第2题：使用 `df.isna().sum()`（2分）
- 第3题：正确使用 `fillna(均值)`（3分，直接填均值得3分，填0扣1分）
- 第4题：`df[df["成绩"] >= 80]`（2分）
- 第5题：`df.groupby("班级")["成绩"].mean()`（3分）
- 第6题：`df.sort_values("成绩", ascending=False)`（2分）

</details>

---

### 第3题：Matplotlib 数据可视化（14分）

**题目描述：**
有以下某电商平台 2025 年 1-6 月的销售额数据（单位：万元）：

```
月份:    1,   2,   3,   4,   5,   6
销售额:  120, 135, 110, 150, 165, 180
```

请用 Matplotlib 绘制：

1. 创建画布，大小为 8×5 英寸（2分）
2. 绘制带圆形标记（`o`）的蓝色折线图（4分）
3. 设置标题为"2025年上半年销售额趋势"，X轴标签为"月份"，Y轴标签为"销售额（万元）"（3分）
4. 显示网格线（2分）
5. 保存图片为 "sales.png"（3分）

<details>
<summary>✅ 展开查看参考实现</summary>

```python
import matplotlib.pyplot as plt
import numpy as np

# 数据
months = np.array([1, 2, 3, 4, 5, 6])
sales = np.array([120, 135, 110, 150, 165, 180])

# 1. 创建画布
fig, ax = plt.subplots(figsize=(8, 5))

# 2. 绘制折线图
ax.plot(months, sales, marker="o", color="blue", linewidth=2)

# 3. 设置标题和标签
ax.set_title("2025年上半年销售额趋势", fontsize=14)
ax.set_xlabel("月份", fontsize=12)
ax.set_ylabel("销售额（万元）", fontsize=12)

# 4. 网格线
ax.grid(True, linestyle="--", alpha=0.7)

# 5. 保存图片
plt.savefig("sales.png", dpi=150, bbox_inches="tight")

plt.show()
```

**评分标准：**
- 第1题：`plt.subplots(figsize=(8,5))` 或等效（2分）
- 第2题：`ax.plot()` 或 `plt.plot()` 正确传参（4分，画出了得2分，有 marker 得1分，颜色 blue 得1分）
- 第3题：正确设置标题和标签（3分，每个1分）
- 第4题：`ax.grid(True)` 或 `plt.grid(True)`（2分）
- 第5题：`plt.savefig("sales.png")` 在 `plt.show()` 之前调用（3分）

</details>

---

## 四、成绩评估

| 得分 | 等级 | 建议 |
|------|------|------|
| 85-100 | 🟢 优秀 | 可以自信去考试了！ |
| 70-84 | 🟡 良好 | 已达到 70 分目标，建议复习错题 |
| 60-69 | 🟠 及格 | 需要查漏补缺，重点复习薄弱环节 |
| <60 | 🔴 不及格 | 建议重新学习对应章节，多做练习 |

---

## 📝 本章小结

- ✅ 选择题 10 道覆盖四大模块概念辨析
- ✅ 填空题 5 道检验 API 记忆
- ✅ 代码题 3 道考察综合运用能力
- ✅ 附完整答案解析，每题都有考点说明

> 💡 **考前提分建议**：错题标记出来，重点复习对应章节的「高频考点」部分，考前 30 分钟翻阅 [考前速记卡](../appendix/quick-review.md)。
