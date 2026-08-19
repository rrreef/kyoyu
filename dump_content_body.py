import sys

def trace(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    start = 0
    for i, line in enumerate(lines):
        if "var body: some View {" in line and "GeometryReader" in lines[i+1]:
            start = i
            break
            
    count = 0
    end = start
    for i in range(start, len(lines)):
        line = lines[i]
        # Ignore comments
        if "//" in line:
            line = line.split("//")[0]
        
        open_b = line.count('{')
        close_b = line.count('}')
        count += (open_b - close_b)
        
        print(f"L{i+1}: {lines[i].rstrip()}")
        if count == 0 and open_b > 0:
            end = i
            break

trace("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift")
