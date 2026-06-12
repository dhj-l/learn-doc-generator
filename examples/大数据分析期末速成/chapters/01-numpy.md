# 第1章 NumPy 数组操作

> ⏱ 预计学习时间：2-3 小时 | 🎯 目标：掌握 NumPy 核心操作，能应对考试中 80% 的 NumPy 题目

## 🎯 本章目标

学习完本章，你将能够：
- 用多种方式创建 ndarray 数组
- 使用索引、切片和布尔掩码访问数组元素
- 用 reshape/flatten 改变数组形状
- 理解广播机制并进行数组运算
- 使用通用函数（ufunc）和统计方法
- 进行简单的线性代数运算
- 读写 NumPy 数组文件

## 📋 前置知识

> 建议先完成 [第0章 Python 基础速通](./00-python-crash.md)，特别是列表操作和函数部分。

---

## 💡 核心概念

### 1.1 NumPy 是什么？

NumPy（Numerical Python）是 Python 做科学计算的**基础库**。它提供了一个高性能的 N 维数组对象 `ndarray`。

**生活中的类比**：普通 Python 列表就像一个个独立的储物箱，NumPy 数组就像一个**大型集装箱**——统一规格、整体搬运、批量处理，速度飞快。

```python
import numpy as np     # 约定俗成的简写
```

> **💡 为什么需要 NumPy？**
> - Python 列表的每个元素都是对象，内存开销大
> - NumPy 数组所有元素类型相同，内存紧凑，计算速度快 10-100 倍
> - 支持向量化操作（无需写循环）

---

## 1.2 创建数组

### 从列表创建

```python
import numpy as np

# 一维数组
arr1 = np.array([1, 2, 3, 4, 5])
print(arr1)          # [1 2 3 4 5]
print(type(arr1))    # <class 'numpy.ndarray'>
print(arr1.shape)    # (5,)  — 形状
print(arr1.dtype)    # int64 — 数据类型

# 二维数组
arr2 = np.array([[1, 2, 3], [4, 5, 6]])
print(arr2)
# [[1 2 3]
#  [4 5 6]]
print(arr2.shape)    # (2, 3) — 2行3列
print(arr2.ndim)     # 2     — 维度数
print(arr2.size)     # 6     — 总元素数
```

### 常用创建函数

```python
# ─── arange：类似 range()，返回数组 ───
print(np.arange(5))          # [0 1 2 3 4]
print(np.arange(2, 8))       # [2 3 4 5 6 7]
print(np.arange(1, 10, 2))   # [1 3 5 7 9]（步长为2）

# ─── zeros / ones：全0 / 全1 数组 ───
print(np.zeros(3))           # [0. 0. 0.]
print(np.zeros((2, 3)))      # 2行3列全0
print(np.ones((2, 2)))       # 2行2列全1

# ─── linspace：等间隔取数 ───
print(np.linspace(0, 1, 5))  # [0.   0.25 0.5  0.75 1.  ]  从0到1取5个数

# ─── random：随机数 ───
np.random.seed(42)           # 固定随机种子，保证结果可重复
print(np.random.rand(3))     # [0.3745 0.9507 0.7320]      均匀分布[0,1)
print(np.random.randn(3))    # 标准正态分布
print(np.random.randint(1, 100, 5))  # 5个[1,100)的随机整数

# ─── empty：未初始化的数组（内容随机） ───
print(np.empty((2, 3)))      # 创建但不初始化，速度最快
```

> **💡 考试重点**：`np.arange(n)` 生成 0~n-1、`np.zeros((行,列))` 注意参数是**元组**

---

## 1.3 数组属性

```python
arr = np.array([[1, 2, 3, 4], [5, 6, 7, 8]])

print(arr.shape)    # (2, 4)  形状
print(arr.ndim)     # 2       维度数
print(arr.size)     # 8       总元素数
print(arr.dtype)    # int64   数据类型
print(arr.itemsize) # 8       每个元素字节数
print(arr.nbytes)   # 64      总字节数
```

---

## 1.4 索引与切片

### 一维数组

```python
arr = np.array([10, 20, 30, 40, 50])

print(arr[0])        # 10   索引（从0开始）
print(arr[-1])       # 50   倒数第一个
print(arr[1:4])      # [20 30 40]  切片 [start:end] 含头不含尾
print(arr[:3])       # [10 20 30]  从头到索引3
print(arr[::2])      # [10 30 50]  步长为2
print(arr[::-1])     # [50 40 30 20 10]  反转
```

### 二维数组

```python
arr2d = np.array([[1, 2, 3],
                   [4, 5, 6],
                   [7, 8, 9]])

print(arr2d[1, 2])       # 6      第2行第3列（逗号语法）
print(arr2d[1])          # [4 5 6]  第2行
print(arr2d[:, 0])       # [1 4 7]  所有行的第1列
print(arr2d[0:2, 1:3])   # [[2 3]  前2行、第2~3列
                          #  [5 6]]
print(arr2d[:, :])       # 整个数组（完整切片）

# 重要：切片返回的是视图（view），修改视图会改变原数组！
sub = arr2d[0:2, 0:2]
sub[0, 0] = 999
print(arr2d[0, 0])       # 999  ← 原数组也被改了！
# 如果需要独立副本，用 .copy()
```

> **💡 考试重点**：二维数组用 `[行, 列]` 逗号语法、切片是视图不是副本

### 布尔索引（高频考点！）

```python
arr = np.array([1, 2, 3, 4, 5, 6])

# ─── 条件筛选 ───
mask = arr > 3
print(mask)              # [False False False  True  True  True]
print(arr[mask])         # [4 5 6]   选出所有大于3的元素

# 一步到位
print(arr[arr > 3])      # [4 5 6]

# ─── 复合条件 ───
print(arr[(arr > 2) & (arr < 6)])   # [3 4 5]  且
print(arr[(arr < 3) | (arr > 5)])   # [1 2 6]  或
print(arr[~(arr == 4)])             # [1 2 3 5 6]  非
```

> **💡 考试重点**：布尔索引 `arr[arr > 阈值]`、复合条件用 `&` `|` `~`、**必须加括号**！

---

## 1.5 数组变形

```python
arr = np.arange(12)
print(arr)               # [0 1 2 3 4 5 6 7 8 9 10 11]

# ─── reshape：改变形状（不改变数据） ───
reshaped = arr.reshape(3, 4)
print(reshaped)
# [[ 0  1  2  3]
#  [ 4  5  6  7]
#  [ 8  9 10 11]]

# -1 表示自动推断
print(arr.reshape(2, -1))    # (2, 6)
print(arr.reshape(-1, 4))    # (3, 4)

# ─── flatten / ravel：展平为一维 ───
arr2d = np.array([[1, 2, 3], [4, 5, 6]])
print(arr2d.flatten())       # [1 2 3 4 5 6]  返回副本
print(arr2d.ravel())         # [1 2 3 4 5 6]  返回视图（尽量用这个）

# ─── 转置 ───
arr2d = np.array([[1, 2, 3], [4, 5, 6]])
print(arr2d.T)               # 转置，行变列
# [[1 4]
#  [2 5]
#  [3 6]]
print(arr2d.transpose())     # 等价
```

> **💡 考试重点**：`reshape` 不改变原数组、`-1` 自动推断、`.T` 转置

---

## 1.6 数组运算

### 算术运算（逐元素）

```python
a = np.array([1, 2, 3, 4])
b = np.array([10, 20, 30, 40])

print(a + b)     # [11 22 33 44]   加法
print(a - b)     # [-9 -18 -27 -36] 减法
print(a * b)     # [10 40 90 160]  乘法（逐元素，非矩阵乘法！）
print(a / b)     # [0.1 0.1 0.1 0.1] 除法
print(a ** 2)    # [1 4 9 16]       乘方
print(a > 2)     # [False False  True  True] 比较

# 标量运算（广播）
print(a + 10)    # [11 12 13 14]   每个元素+10
print(a * 2)     # [2 4 6 8]       每个元素*2
```

### 通用函数（ufunc）

```python
arr = np.array([1, 4, 9, 16, 25])

print(np.sqrt(arr))    # [1. 2. 3. 4. 5.]   开方
print(np.exp(arr))     # e^x
print(np.log(arr))     # 自然对数
print(np.sin(arr))     # 正弦
print(np.abs([-1, -2, 3]))  # [1 2 3]      绝对值
print(np.round([1.234, 5.678], 1))  # [1.2 5.7]  四舍五入
```

### 统计函数（高频考点！）

```python
arr = np.array([[1, 2, 3],
                [4, 5, 6]])

print(np.sum(arr))           # 21         所有元素和
print(np.mean(arr))          # 3.5        平均值
print(np.std(arr))           # 1.707825   标准差
print(np.var(arr))           # 2.916667   方差
print(np.min(arr))           # 1          最小值
print(np.max(arr))           # 6          最大值
print(np.median(arr))        # 3.5        中位数

# 沿指定轴统计（axis=0: 按列, axis=1: 按行）
print(np.sum(arr, axis=0))   # [5 7 9]    每列求和
print(np.sum(arr, axis=1))   # [6 15]     每行求和
print(np.mean(arr, axis=0))  # [2.5 3.5 4.5]  每列均值

# 累积运算
print(np.cumsum([1, 2, 3, 4]))  # [1 3 6 10]  累积和
```

> **💡 考试重点**：`sum/mean/std` 统计函数、`axis=0` 按列、`axis=1` 按行、`cumsum` 累积和

---

## 1.7 广播机制（Broadcasting）

广播让不同形状的数组也能进行运算，是 NumPy 最强大的特性之一。

```python
# ─── 标量广播 ───
a = np.array([1, 2, 3])
print(a + 10)              # [11 12 13]  标量10"广播"到每个元素

# ─── 一维+二维广播 ───
matrix = np.array([[1, 2, 3],
                   [4, 5, 6]])
row = np.array([10, 20, 30])

print(matrix + row)        # 行向量自动扩展
# [[11 22 33]
#  [14 25 36]]

# ─── 列向量广播 ───
col = np.array([[10],
                [20]])
print(matrix + col)
# [[11 12 13]
#  [24 25 26]]

# ─── 标准化（典型应用） ───
data = np.array([[80, 85, 90],
                 [70, 75, 80],
                 [90, 95, 100]])
mean = np.mean(data, axis=0)      # 每列均值
std = np.std(data, axis=0)        # 每列标准差
normalized = (data - mean) / std  # 广播实现标准化
print(normalized)
```

> **💡 广播规则**：从最后一个维度开始比较，维度相同或其中一个为 1 即可广播

---

## 1.8 线性代数基础

```python
# ─── 矩阵乘法 dot ───
a = np.array([[1, 2], [3, 4]])
b = np.array([[5, 6], [7, 8]])

print(np.dot(a, b))        # 矩阵乘法
# [[19 22]
#  [43 50]]
print(a @ b)               # @ 运算符，等价于 dot

# ─── 逐元素乘法 vs 矩阵乘法 ───
print(a * b)               # [[5 12] [21 32]]   逐元素乘
print(a @ b)               # [[19 22] [43 50]]  矩阵乘

# ─── 行列式 ───
from numpy.linalg import det, inv
print(det(a))              # -2.0000000000000004  行列式

# ─── 逆矩阵 ───
print(inv(a))
# [[-2.   1. ]
#  [ 1.5 -0.5]]

# ─── 验证：A * A^-1 = 单位矩阵 ───
print(a @ inv(a))
# [[1. 0.]
#  [0. 1.]]
```

> **💡 考试重点**：`np.dot()` 或 `@` 做矩阵乘法、`a * b` 是逐元素乘

---

## 🔨 实战演练

### 练习：NumPy 文件读写实战

```python
# ─── 保存为文本文件 ───
arr = np.array([[1, 2, 3], [4, 5, 6]])
np.savetxt("data.csv", arr, delimiter=",", fmt="%.2f")

# ─── 读取文本文件 ───
loaded = np.loadtxt("data.csv", delimiter=",")
print(loaded)

# ─── 保存为二进制格式（更小更快） ───
np.save("data.npy", arr)

# ─── 读取二进制文件 ───
loaded_npy = np.load("data.npy")
print(loaded_npy)
```

> **预期输出：**
> ```
> [[1. 2. 3.]
>  [4. 5. 6.]]
> [[1. 2. 3.]
>  [4. 5. 6.]]
> ```

```python
# ─── 保存为文本文件 ───
arr = np.array([[1, 2, 3], [4, 5, 6]])
np.savetxt("data.csv", arr, delimiter=",", fmt="%.2f")

# ─── 读取文本文件 ───
loaded = np.loadtxt("data.csv", delimiter=",")
print(loaded)

# ─── 保存为二进制格式（更小更快） ───
np.save("data.npy", arr)

# ─── 读取二进制文件 ───
loaded_npy = np.load("data.npy")
print(loaded_npy)
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：`np.arange(5)` 和 `np.arange(2, 10, 3)` 的输出分别是什么？**
> A：`[0 1 2 3 4]` 和 `[2 5 8]`

**Q2：二维数组 arr 的 shape 是 (3,4)，`arr.reshape(-1)` 的结果形状是什么？**
> A：`(12,)` 展平为一维

**Q3：`np.sum(arr, axis=0)` 和 `np.sum(arr, axis=1)` 的区别？**
> A：`axis=0` 按列求和（压缩行），`axis=1` 按行求和（压缩列）

**Q4：`arr[arr > 5]` 返回什么？**
> A：返回 arr 中所有大于 5 的元素组成的一维数组

**Q5：`a * b` 和 `a @ b` 的区别？**
> A：`a * b` 是逐元素乘法，`a @ b` 是矩阵乘法

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `IndexError: index 3 is out of bounds` | 索引越界 | 检查数组长度 |
| `arr[arr > 3 & arr < 6]` 报错 | 缺少括号 | 写为 `arr[(arr > 3) & (arr < 6)]` |
| `np.zeros(2,3)` 报错 | 形状参数需为元组 | 写为 `np.zeros((2,3))` |
| 修改切片影响了原数组 | 切片是视图 | 用 `.copy()` 创建副本 |

---

## 📝 本章小结

- ✅ `np.array()` 创建数组，`shape/dtype/ndim` 查看属性
- ✅ 索引 `arr[行, 列]`、切片 `[start:end]`、布尔索引 `arr[条件]`
- ✅ `reshape` 变形、`flatten` 展平、`.T` 转置
- ✅ 广播机制让不同形状数组也能运算
- ✅ 统计函数 `sum/mean/std` 配合 `axis` 参数
- ✅ `np.dot()` / `@` 矩阵乘法

## ➡️ 下一章预告

> 数组操作只是第一步。下一章我们将学习 **Pandas**——数据分析的瑞士军刀，处理表格数据的终极工具。
> [下一章：Pandas 基础与数据清洗](./02-pandas-basics.md)
