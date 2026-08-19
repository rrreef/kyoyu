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
        if count == 0 and open_b > 0:
            end = i
            break

    # Print the top level views inside ZStack
    in_zstack = False
    zstack_count = 0
    for i in range(start, end):
        line = lines[i]
        
        if "ZStack(alignment: .bottom)" in line:
            in_zstack = True
            zstack_count = 1
            continue
            
        if in_zstack:
            clean_line = line.split("//")[0]
            open_b = clean_line.count('{')
            close_b = clean_line.count('}')
            
            if zstack_count == 1 and line.strip() != "" and not line.strip().startswith(".") and not line.strip().startswith("}") and not line.strip().startswith("{") and not line.strip().startswith("let "):
                print(f"L{i+1}: {line.strip()}")
            
            zstack_count += (open_b - close_b)
            if zstack_count == 0:
                break

trace("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift")
